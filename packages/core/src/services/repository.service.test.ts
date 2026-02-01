import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import * as repositoryService from './repository.service';

describe('repositoryService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  describe('register', () => {
    it('creates a new repository', () => {
      const repo = repositoryService.register(db, { path: '/home/user/project' });
      expect(repo.path).toBe('/home/user/project');
      expect(repo.name).toBeNull();
      expect(repo.id).toMatch(/^rp_[0-9a-z]{12}$/);
    });

    it('returns existing repository when re-registering same path', () => {
      const first = repositoryService.register(db, { path: '/home/user/project' });
      const second = repositoryService.register(db, { path: '/home/user/project' });
      expect(second.id).toBe(first.id);
      expect(second.created_at).toBe(first.created_at);
    });

    it('accepts an optional name', () => {
      const repo = repositoryService.register(db, {
        path: '/home/user/project',
        name: 'my-project',
      });
      expect(repo.name).toBe('my-project');
    });

    it('sets created_at and updated_at timestamps', () => {
      const before = Date.now();
      const repo = repositoryService.register(db, { path: '/home/user/project' });
      const after = Date.now();
      expect(repo.created_at).toBeGreaterThanOrEqual(before);
      expect(repo.created_at).toBeLessThanOrEqual(after);
      expect(repo.updated_at).toBe(repo.created_at);
    });

    it('creates distinct repositories for different paths', () => {
      const a = repositoryService.register(db, { path: '/a' });
      const b = repositoryService.register(db, { path: '/b' });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('list', () => {
    it('returns empty list when no repositories exist', () => {
      const result = repositoryService.list(db);
      expect(result.repositories).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns all repositories with correct total', () => {
      repositoryService.register(db, { path: '/first' });
      repositoryService.register(db, { path: '/second' });
      repositoryService.register(db, { path: '/third' });

      const result = repositoryService.list(db);
      expect(result.repositories).toHaveLength(3);
      expect(result.total).toBe(3);
      const paths = result.repositories.map((r) => r.path);
      expect(paths).toContain('/first');
      expect(paths).toContain('/second');
      expect(paths).toContain('/third');
    });

    it('respects limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        repositoryService.register(db, { path: `/repo-${i}` });
      }

      const page1 = repositoryService.list(db, { limit: 2, offset: 0 });
      expect(page1.repositories).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = repositoryService.list(db, { limit: 2, offset: 2 });
      expect(page2.repositories).toHaveLength(2);
      expect(page2.total).toBe(5);

      const page3 = repositoryService.list(db, { limit: 2, offset: 4 });
      expect(page3.repositories).toHaveLength(1);
      expect(page3.total).toBe(5);
    });

    it('defaults to limit 20 offset 0', () => {
      for (let i = 0; i < 25; i++) {
        repositoryService.register(db, { path: `/repo-${i}` });
      }

      const result = repositoryService.list(db);
      expect(result.repositories).toHaveLength(20);
      expect(result.total).toBe(25);
    });
  });

  describe('getByPath', () => {
    it('returns repository when found', () => {
      const created = repositoryService.register(db, { path: '/home/user/project' });
      const found = repositoryService.getByPath(db, '/home/user/project');
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it('returns null when not found', () => {
      const result = repositoryService.getByPath(db, '/nonexistent');
      expect(result).toBeNull();
    });

    it('matches path exactly', () => {
      repositoryService.register(db, { path: '/home/user/project' });
      expect(repositoryService.getByPath(db, '/home/user/project/')).toBeNull();
      expect(repositoryService.getByPath(db, '/home/user')).toBeNull();
    });
  });
});
