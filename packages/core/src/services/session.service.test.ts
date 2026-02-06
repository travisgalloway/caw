import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import * as sessionService from './session.service';

describe('sessionService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- register ---

  describe('register', () => {
    it('creates a session with defaults', () => {
      const session = sessionService.register(db, { pid: 1234 });

      expect(session.id).toMatch(/^ss_[0-9a-z]{12}$/);
      expect(session.pid).toBe(1234);
      expect(session.started_at).toBeGreaterThan(0);
      expect(session.last_heartbeat).toBe(session.started_at);
      expect(session.is_daemon).toBe(0);
      expect(session.metadata).toBeNull();
    });

    it('creates a daemon session', () => {
      const session = sessionService.register(db, { pid: 1234, is_daemon: true });

      expect(session.is_daemon).toBe(1);
    });

    it('serializes metadata as JSON', () => {
      const session = sessionService.register(db, {
        pid: 1234,
        metadata: { port: 3100, version: '1.0' },
      });

      const parsed = JSON.parse(session.metadata as string);
      expect(parsed).toEqual({ port: 3100, version: '1.0' });
    });

    it('persists to database', () => {
      const session = sessionService.register(db, { pid: 1234 });

      const fetched = sessionService.get(db, session.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.pid).toBe(1234);
    });
  });

  // --- heartbeat ---

  describe('heartbeat', () => {
    it('updates last_heartbeat timestamp', () => {
      const session = sessionService.register(db, { pid: 1234 });

      const updated = sessionService.heartbeat(db, session.id);
      expect(updated.last_heartbeat).toBeGreaterThanOrEqual(session.last_heartbeat);
    });

    it('throws when session not found', () => {
      expect(() => sessionService.heartbeat(db, 'ss_nonexistent')).toThrow('Session not found');
    });

    it('persists heartbeat to database', () => {
      const session = sessionService.register(db, { pid: 1234 });

      sessionService.heartbeat(db, session.id);

      const fetched = sessionService.get(db, session.id);
      expect(fetched?.last_heartbeat).toBeGreaterThanOrEqual(session.last_heartbeat);
    });
  });

  // --- get ---

  describe('get', () => {
    it('returns session when found', () => {
      const session = sessionService.register(db, { pid: 1234 });

      const result = sessionService.get(db, session.id);
      expect(result).not.toBeNull();
      expect(result?.pid).toBe(1234);
    });

    it('returns null when not found', () => {
      const result = sessionService.get(db, 'ss_nonexistent');
      expect(result).toBeNull();
    });
  });

  // --- list ---

  describe('list', () => {
    it('returns all sessions', () => {
      sessionService.register(db, { pid: 1111 });
      sessionService.register(db, { pid: 2222 });

      const sessions = sessionService.list(db);
      expect(sessions).toHaveLength(2);
    });

    it('returns empty array when no sessions', () => {
      const sessions = sessionService.list(db);
      expect(sessions).toEqual([]);
    });
  });

  // --- getDaemon ---

  describe('getDaemon', () => {
    it('returns daemon session', () => {
      sessionService.register(db, { pid: 1111 });
      const daemon = sessionService.register(db, { pid: 2222, is_daemon: true });

      const result = sessionService.getDaemon(db);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(daemon.id);
    });

    it('returns null when no daemon', () => {
      sessionService.register(db, { pid: 1111 });

      const result = sessionService.getDaemon(db);
      expect(result).toBeNull();
    });
  });

  // --- promoteToDaemon ---

  describe('promoteToDaemon', () => {
    it('sets is_daemon to 1', () => {
      const session = sessionService.register(db, { pid: 1234 });
      expect(session.is_daemon).toBe(0);

      const promoted = sessionService.promoteToDaemon(db, session.id);
      expect(promoted.is_daemon).toBe(1);

      const fetched = sessionService.get(db, session.id);
      expect(fetched?.is_daemon).toBe(1);
    });

    it('throws when session not found', () => {
      expect(() => sessionService.promoteToDaemon(db, 'ss_nonexistent')).toThrow(
        'Session not found',
      );
    });
  });

  // --- deregister ---

  describe('deregister', () => {
    it('removes session from database', () => {
      const session = sessionService.register(db, { pid: 1234 });

      const result = sessionService.deregister(db, session.id);
      expect(result).toBe(true);

      const fetched = sessionService.get(db, session.id);
      expect(fetched).toBeNull();
    });

    it('returns false when session not found', () => {
      const result = sessionService.deregister(db, 'ss_nonexistent');
      expect(result).toBe(false);
    });
  });

  // --- getStale ---

  describe('getStale', () => {
    it('returns sessions with old heartbeats', () => {
      const session = sessionService.register(db, { pid: 1234 });

      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      db.prepare('UPDATE sessions SET last_heartbeat = ? WHERE id = ?').run(
        tenMinutesAgo,
        session.id,
      );

      const stale = sessionService.getStale(db, 5 * 60 * 1000);
      expect(stale).toHaveLength(1);
      expect(stale[0].id).toBe(session.id);
    });

    it('excludes fresh sessions', () => {
      sessionService.register(db, { pid: 1234 });

      const stale = sessionService.getStale(db, 5 * 60 * 1000);
      expect(stale).toHaveLength(0);
    });
  });

  // --- cleanupStale ---

  describe('cleanupStale', () => {
    it('removes stale sessions and returns count', () => {
      const s1 = sessionService.register(db, { pid: 1111 });
      sessionService.register(db, { pid: 2222 });

      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      db.prepare('UPDATE sessions SET last_heartbeat = ? WHERE id = ?').run(tenMinutesAgo, s1.id);

      const cleaned = sessionService.cleanupStale(db, 5 * 60 * 1000);
      expect(cleaned).toBe(1);

      const remaining = sessionService.list(db);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].pid).toBe(2222);
    });

    it('returns 0 when no stale sessions', () => {
      sessionService.register(db, { pid: 1234 });

      const cleaned = sessionService.cleanupStale(db, 5 * 60 * 1000);
      expect(cleaned).toBe(0);
    });
  });
});
