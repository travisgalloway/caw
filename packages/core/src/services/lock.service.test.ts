import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import * as lockService from './lock.service';
import * as sessionService from './session.service';
import * as workflowService from './workflow.service';

function createWorkflow(db: DatabaseType): string {
  const wf = workflowService.create(db, {
    name: 'Test WF',
    source_type: 'prompt',
    source_content: 'test',
  });
  return wf.id;
}

function createSession(db: DatabaseType, pid = 1234): string {
  const session = sessionService.register(db, { pid });
  return session.id;
}

describe('lockService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- lock ---

  describe('lock', () => {
    it('locks an unlocked workflow', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      const result = lockService.lock(db, wfId, sessionId);

      expect(result.success).toBe(true);
      expect(result.locked_by).toBe(sessionId);
      expect(result.locked_at).toBeGreaterThan(0);
    });

    it('is idempotent for same session', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      const first = lockService.lock(db, wfId, sessionId);
      const second = lockService.lock(db, wfId, sessionId);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(second.locked_by).toBe(sessionId);
    });

    it('fails when locked by another session', () => {
      const wfId = createWorkflow(db);
      const sessionA = createSession(db, 1000);
      const sessionB = createSession(db, 2000);

      lockService.lock(db, wfId, sessionA);
      const result = lockService.lock(db, wfId, sessionB);

      expect(result.success).toBe(false);
      expect(result.locked_by).toBe(sessionA);
    });

    it('takes over lock when holder session is gone', () => {
      const wfId = createWorkflow(db);
      const sessionA = createSession(db, 1000);
      const sessionB = createSession(db, 2000);

      lockService.lock(db, wfId, sessionA);

      // Remove session A (simulates cleanup)
      sessionService.deregister(db, sessionA);

      const result = lockService.lock(db, wfId, sessionB);

      expect(result.success).toBe(true);
      expect(result.locked_by).toBe(sessionB);
    });

    it('throws for workflow not found', () => {
      const sessionId = createSession(db);

      expect(() => lockService.lock(db, 'wf_nonexistent', sessionId)).toThrow('Workflow not found');
    });

    it('throws for session not found', () => {
      const wfId = createWorkflow(db);

      expect(() => lockService.lock(db, wfId, 'ss_nonexistent')).toThrow('Session not found');
    });
  });

  // --- unlock ---

  describe('unlock', () => {
    it('unlocks a locked workflow', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      lockService.lock(db, wfId, sessionId);
      const result = lockService.unlock(db, wfId, sessionId);

      expect(result).toBe(true);

      // Verify unlocked
      const info = lockService.getLockInfo(db, wfId);
      expect(info.locked).toBe(false);
    });

    it('is idempotent when not locked', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      const result = lockService.unlock(db, wfId, sessionId);
      expect(result).toBe(true);
    });

    it('throws when locked by different session', () => {
      const wfId = createWorkflow(db);
      const sessionA = createSession(db, 1000);
      const sessionB = createSession(db, 2000);

      lockService.lock(db, wfId, sessionA);

      expect(() => lockService.unlock(db, wfId, sessionB)).toThrow('is locked by session');
    });

    it('throws for workflow not found', () => {
      const sessionId = createSession(db);

      expect(() => lockService.unlock(db, 'wf_nonexistent', sessionId)).toThrow(
        'Workflow not found',
      );
    });
  });

  // --- getLockInfo ---

  describe('getLockInfo', () => {
    it('returns unlocked info for unlocked workflow', () => {
      const wfId = createWorkflow(db);

      const info = lockService.getLockInfo(db, wfId);

      expect(info.locked).toBe(false);
      expect(info.session_id).toBeNull();
      expect(info.locked_at).toBeNull();
      expect(info.session_pid).toBeNull();
    });

    it('returns lock info with PID for locked workflow', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db, 5678);

      lockService.lock(db, wfId, sessionId);
      const info = lockService.getLockInfo(db, wfId);

      expect(info.locked).toBe(true);
      expect(info.session_id).toBe(sessionId);
      expect(info.locked_at).toBeGreaterThan(0);
      expect(info.session_pid).toBe(5678);
    });

    it('throws for workflow not found', () => {
      expect(() => lockService.getLockInfo(db, 'wf_nonexistent')).toThrow('Workflow not found');
    });
  });

  // --- isLockedByOther ---

  describe('isLockedByOther', () => {
    it('returns false for unlocked workflow', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      const check = lockService.isLockedByOther(db, wfId, sessionId);

      expect(check.locked).toBe(false);
    });

    it('returns false when locked by same session', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      lockService.lock(db, wfId, sessionId);
      const check = lockService.isLockedByOther(db, wfId, sessionId);

      expect(check.locked).toBe(false);
    });

    it('returns true when locked by other session', () => {
      const wfId = createWorkflow(db);
      const sessionA = createSession(db, 1000);
      const sessionB = createSession(db, 2000);

      lockService.lock(db, wfId, sessionA);
      const check = lockService.isLockedByOther(db, wfId, sessionB);

      expect(check.locked).toBe(true);
      expect(check.holder_session_id).toBe(sessionA);
      expect(check.holder_pid).toBe(1000);
    });

    it('throws for workflow not found', () => {
      const sessionId = createSession(db);

      expect(() => lockService.isLockedByOther(db, 'wf_nonexistent', sessionId)).toThrow(
        'Workflow not found',
      );
    });
  });

  // --- releaseStaleWorkflowLocks ---

  describe('releaseStaleWorkflowLocks', () => {
    it('releases locks held by stale sessions', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      lockService.lock(db, wfId, sessionId);

      // Make session stale by backdating heartbeat
      db.prepare('UPDATE sessions SET last_heartbeat = ? WHERE id = ?').run(
        Date.now() - 120_000,
        sessionId,
      );

      const released = lockService.releaseStaleWorkflowLocks(db, 60_000);

      expect(released).toBe(1);

      const info = lockService.getLockInfo(db, wfId);
      expect(info.locked).toBe(false);
    });

    it('keeps locks held by active sessions', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      lockService.lock(db, wfId, sessionId);

      const released = lockService.releaseStaleWorkflowLocks(db, 60_000);

      expect(released).toBe(0);

      const info = lockService.getLockInfo(db, wfId);
      expect(info.locked).toBe(true);
    });

    it('returns count of released locks', () => {
      const wf1 = createWorkflow(db);
      const wf2 = createWorkflow(db);
      const staleSession = createSession(db, 1000);
      const activeSession = createSession(db, 2000);

      lockService.lock(db, wf1, staleSession);
      lockService.lock(db, wf2, activeSession);

      // Make first session stale
      db.prepare('UPDATE sessions SET last_heartbeat = ? WHERE id = ?').run(
        Date.now() - 120_000,
        staleSession,
      );

      const released = lockService.releaseStaleWorkflowLocks(db, 60_000);

      expect(released).toBe(1);

      // wf1 should be unlocked, wf2 still locked
      expect(lockService.getLockInfo(db, wf1).locked).toBe(false);
      expect(lockService.getLockInfo(db, wf2).locked).toBe(true);
    });
  });
});
