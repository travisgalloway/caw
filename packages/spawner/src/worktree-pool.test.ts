import { describe, expect, test } from 'bun:test';
import { WorktreePool } from './worktree-pool';

// Note: These are unit tests that mock the git operations.
// Integration tests would need a real git repo.

describe('WorktreePool', () => {
  describe('construction', () => {
    test('creates pool with options', () => {
      const pool = new WorktreePool({
        repoPath: '/tmp/test-repo',
        poolSize: 3,
        baseBranch: 'main',
      });
      expect(pool.isInitialized()).toBe(false);
    });
  });

  describe('getStats', () => {
    test('returns zero stats when not initialized', () => {
      const pool = new WorktreePool({
        repoPath: '/tmp/test-repo',
        poolSize: 3,
      });
      const stats = pool.getStats();
      expect(stats.total).toBe(0);
      expect(stats.inUse).toBe(0);
      expect(stats.available).toBe(0);
    });
  });

  describe('release', () => {
    test('release on non-existent task is a no-op', () => {
      const pool = new WorktreePool({
        repoPath: '/tmp/test-repo',
        poolSize: 3,
      });
      // Should not throw
      pool.release('tk_nonexistent');
    });
  });

  describe('getForTask', () => {
    test('returns null for unknown task', () => {
      const pool = new WorktreePool({
        repoPath: '/tmp/test-repo',
        poolSize: 3,
      });
      expect(pool.getForTask('tk_nonexistent')).toBeNull();
    });
  });
});
