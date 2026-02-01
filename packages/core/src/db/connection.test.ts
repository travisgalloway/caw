import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
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
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
    db.close();
  });
});

describe('getDbPath', () => {
  it('returns global path', () => {
    const result = getDbPath('global');
    expect(result).toBe(join(homedir(), '.caw', 'workflows.db'));
  });

  it('returns repository-local path', () => {
    const result = getDbPath('repository', '/home/user/my-project');
    expect(result).toBe(join('/home/user/my-project', '.caw', 'workflows.db'));
  });

  it('throws if repository mode missing repoPath', () => {
    expect(() => getDbPath('repository')).toThrow('repoPath is required for repository mode');
  });
});
