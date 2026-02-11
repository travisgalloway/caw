import { describe, expect, it } from 'bun:test';
import { rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection, getDbPath } from './connection';

describe('createConnection', () => {
  it('creates an in-memory database', () => {
    const db = createConnection(':memory:');
    expect(db).toBeDefined();
    const result = db.prepare('SELECT 1 as val').get() as { val: number };
    expect(result.val).toBe(1);
    db.close();
  });

  it('enables foreign keys', () => {
    const db = createConnection(':memory:');
    const result = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(result.foreign_keys).toBe(1);
    db.close();
  });

  it('enables WAL mode on file-backed databases', () => {
    const tmpPath = join(tmpdir(), `caw-test-wal-${crypto.randomUUID()}.db`);
    try {
      const db = createConnection(tmpPath);
      const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(result.journal_mode).toBe('wal');
      db.close();
    } finally {
      rmSync(tmpPath, { force: true });
      rmSync(`${tmpPath}-wal`, { force: true });
      rmSync(`${tmpPath}-shm`, { force: true });
    }
  });

  it('sets busy timeout to 5000ms', () => {
    const db = createConnection(':memory:');
    const result = db.prepare('PRAGMA busy_timeout').get() as { timeout: number };
    expect(result.timeout).toBe(5000);
    db.close();
  });
});

describe('getDbPath', () => {
  it('returns global path', () => {
    const result = getDbPath('global');
    expect(result).toBe(join(homedir(), '.caw', 'workflows.db'));
  });

  it('returns per-repo path', () => {
    const result = getDbPath('per-repo', '/home/user/my-project');
    expect(result).toBe(join('/home/user/my-project', '.caw', 'workflows.db'));
  });

  it('throws if per-repo mode missing repoPath', () => {
    expect(() => getDbPath('per-repo')).toThrow('repoPath is required for per-repo mode');
  });
});
