import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export type DatabaseType = Database.Database;

export function createConnection(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function getDbPath(mode: 'global' | 'repository', repoPath?: string): string {
  if (mode === 'global') {
    return join(homedir(), '.caw', 'workflows.db');
  }

  if (!repoPath) {
    throw new Error('repoPath is required for repository mode');
  }

  return join(repoPath, '.caw', 'workflows.db');
}
