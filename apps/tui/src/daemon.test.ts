import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, sessionService } from '@caw/core';
import {
  getLockFilePath,
  healthCheck,
  initDaemon,
  isProcessAlive,
  type LockFileData,
} from './daemon';

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `caw-daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function randomPort(): number {
  return 49152 + Math.floor(Math.random() * 16383);
}

describe('daemon', () => {
  let tempDir: string;
  let dbPath: string;
  let db: DatabaseType;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir, 'workflows.db');
    db = createConnection(dbPath);
    runMigrations(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // already closed
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- getLockFilePath ---

  describe('getLockFilePath', () => {
    it('derives lock file path from db path', () => {
      const lockPath = getLockFilePath('/home/user/.caw/workflows.db');
      expect(lockPath).toBe('/home/user/.caw/server.lock');
    });

    it('works with nested paths', () => {
      const lockPath = getLockFilePath('/project/.caw/workflows.db');
      expect(lockPath).toBe('/project/.caw/server.lock');
    });
  });

  // --- isProcessAlive ---

  describe('isProcessAlive', () => {
    it('returns true for current process', () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('returns false for non-existent PID', () => {
      // Use a very high PID unlikely to exist
      expect(isProcessAlive(9999999)).toBe(false);
    });
  });

  // --- healthCheck ---

  describe('healthCheck', () => {
    it('returns false when no server is running', async () => {
      // Use a port unlikely to be in use
      const result = await healthCheck(59999);
      expect(result).toBe(false);
    });
  });

  // --- lock file read/write/remove ---

  describe('lock file operations', () => {
    it('writes and reads lock file', () => {
      const lockPath = join(tempDir, 'server.lock');
      const data: LockFileData = { pid: 1234, port: 3100, session_id: 'ss_test123456' };

      writeFileSync(lockPath, JSON.stringify(data));
      const content = JSON.parse(readFileSync(lockPath, 'utf-8'));

      expect(content.pid).toBe(1234);
      expect(content.port).toBe(3100);
      expect(content.session_id).toBe('ss_test123456');
    });

    it('atomic write fails if file exists', () => {
      const lockPath = join(tempDir, 'server.lock');
      writeFileSync(lockPath, '{}');

      // wx flag should fail if file exists
      let threw = false;
      try {
        writeFileSync(lockPath, '{"pid": 5678}', { flag: 'wx' });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  // --- initDaemon ---

  describe('initDaemon', () => {
    it('becomes daemon as first instance', async () => {
      const result = await initDaemon(db, dbPath, randomPort());

      expect(result.isDaemon).toBe(true);
      expect(result.sessionId).toMatch(/^ss_[0-9a-z]{12}$/);

      // Lock file should be created
      const lockPath = getLockFilePath(dbPath);
      expect(existsSync(lockPath)).toBe(true);

      const lockContent = JSON.parse(readFileSync(lockPath, 'utf-8'));
      expect(lockContent.pid).toBe(process.pid);
      expect(lockContent.session_id).toBe(result.sessionId);

      // Session should be in DB as daemon
      const session = sessionService.get(db, result.sessionId);
      expect(session).not.toBeNull();
      expect(session?.is_daemon).toBe(1);

      result.cleanup();
    });

    it('detects stale lock and becomes daemon', async () => {
      const lockPath = getLockFilePath(dbPath);

      // Create a stale lock with a dead PID
      const staleLock: LockFileData = { pid: 9999999, port: 3100, session_id: 'ss_stale0000000' };
      writeFileSync(lockPath, JSON.stringify(staleLock));

      // Register a stale session
      db.prepare(
        `INSERT INTO sessions (id, pid, started_at, last_heartbeat, is_daemon, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('ss_stale0000000', 9999999, Date.now() - 120_000, Date.now() - 120_000, 1, null);

      const result = await initDaemon(db, dbPath, randomPort());

      expect(result.isDaemon).toBe(true);

      // Stale session deregistered by initDaemon (via deregister after dead PID check)
      const staleSession = sessionService.get(db, 'ss_stale0000000');
      expect(staleSession).toBeNull();

      result.cleanup();
    });

    it('cleanup deregisters session and removes lock file', async () => {
      const result = await initDaemon(db, dbPath, randomPort());

      const lockPath = getLockFilePath(dbPath);
      expect(existsSync(lockPath)).toBe(true);

      result.cleanup();

      // Lock file should be removed
      expect(existsSync(lockPath)).toBe(false);

      // Session should be deregistered
      const session = sessionService.get(db, result.sessionId);
      expect(session).toBeNull();
    });

    it('cleanup is idempotent', async () => {
      const result = await initDaemon(db, dbPath, randomPort());

      result.cleanup();
      result.cleanup(); // should not throw

      const session = sessionService.get(db, result.sessionId);
      expect(session).toBeNull();
    });
  });
});
