import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type DatabaseType = InstanceType<typeof Database>;

/** Compatible parameter type for bun:sqlite query bindings. */
export type SQLParam = null | string | number | bigint | boolean | Uint8Array;

export function createConnection(dbPath: string): DatabaseType {
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA busy_timeout = 5000');
  return db;
}

export function getDbPath(mode: 'global' | 'per-repo', repoPath?: string): string {
  if (mode === 'global') {
    return join(homedir(), '.caw', 'workflows.db');
  }

  if (!repoPath) {
    throw new Error('repoPath is required for per-repo mode');
  }

  return join(repoPath, '.caw', 'workflows.db');
}
