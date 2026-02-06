import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import {
  createConnection,
  lockService,
  runMigrations,
  sessionService,
  workflowService,
  workspaceService,
} from '@caw/core';
import {
  requireWorkflowLock,
  requireWorkflowLockForTask,
  requireWorkflowLockForWorkspace,
} from './lock-guard';
import { ToolCallError } from './types';

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

function createWorkflowWithTask(db: DatabaseType): { workflowId: string; taskId: string } {
  const wf = workflowService.create(db, {
    name: 'Test WF',
    source_type: 'prompt',
    source_content: 'test',
  });
  workflowService.setPlan(db, wf.id, {
    summary: 'plan',
    tasks: [{ name: 'task1' }],
  });
  const tasks = db.prepare('SELECT id FROM tasks WHERE workflow_id = ?').all(wf.id) as {
    id: string;
  }[];
  return { workflowId: wf.id, taskId: tasks[0].id };
}

describe('lock-guard', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- requireWorkflowLock ---

  describe('requireWorkflowLock', () => {
    it('skips check when sessionId is undefined', () => {
      const wfId = createWorkflow(db);
      const sessionA = createSession(db, 1000);

      // Lock with session A
      lockService.lock(db, wfId, sessionA);

      // No session_id provided — should not throw even though locked
      expect(() => requireWorkflowLock(db, wfId, undefined)).not.toThrow();
    });

    it('passes when workflow is unlocked', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      expect(() => requireWorkflowLock(db, wfId, sessionId)).not.toThrow();
    });

    it('passes when locked by same session', () => {
      const wfId = createWorkflow(db);
      const sessionId = createSession(db);

      lockService.lock(db, wfId, sessionId);

      expect(() => requireWorkflowLock(db, wfId, sessionId)).not.toThrow();
    });

    it('throws WORKFLOW_LOCKED when locked by another session', () => {
      const wfId = createWorkflow(db);
      const sessionA = createSession(db, 1000);
      const sessionB = createSession(db, 2000);

      lockService.lock(db, wfId, sessionA);

      try {
        requireWorkflowLock(db, wfId, sessionB);
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(ToolCallError);
        const toolErr = err as ToolCallError;
        expect(toolErr.code).toBe('WORKFLOW_LOCKED');
        expect(toolErr.recoverable).toBe(true);
      }
    });
  });

  // --- requireWorkflowLockForTask ---

  describe('requireWorkflowLockForTask', () => {
    it('resolves task to workflow and checks lock', () => {
      const { workflowId, taskId } = createWorkflowWithTask(db);
      const sessionA = createSession(db, 1000);
      const sessionB = createSession(db, 2000);

      lockService.lock(db, workflowId, sessionA);

      try {
        requireWorkflowLockForTask(db, taskId, sessionB);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ToolCallError);
        expect((err as ToolCallError).code).toBe('WORKFLOW_LOCKED');
      }
    });

    it('passes through when task not found', () => {
      const sessionId = createSession(db);

      // Task doesn't exist — guard should not throw (let actual handler throw TASK_NOT_FOUND)
      expect(() => requireWorkflowLockForTask(db, 'tk_nonexistent', sessionId)).not.toThrow();
    });

    it('skips check when sessionId is undefined', () => {
      const { taskId } = createWorkflowWithTask(db);

      expect(() => requireWorkflowLockForTask(db, taskId, undefined)).not.toThrow();
    });
  });

  // --- requireWorkflowLockForWorkspace ---

  describe('requireWorkflowLockForWorkspace', () => {
    it('resolves workspace to workflow and checks lock', () => {
      const wfId = createWorkflow(db);
      const sessionA = createSession(db, 1000);
      const sessionB = createSession(db, 2000);

      const ws = workspaceService.create(db, {
        workflowId: wfId,
        path: '/tmp/test-ws',
        branch: 'feature/test',
      });

      lockService.lock(db, wfId, sessionA);

      try {
        requireWorkflowLockForWorkspace(db, ws.id, sessionB);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ToolCallError);
        expect((err as ToolCallError).code).toBe('WORKFLOW_LOCKED');
      }
    });

    it('passes through when workspace not found', () => {
      const sessionId = createSession(db);

      expect(() => requireWorkflowLockForWorkspace(db, 'ws_nonexistent', sessionId)).not.toThrow();
    });
  });
});
