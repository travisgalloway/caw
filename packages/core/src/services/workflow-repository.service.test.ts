import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import * as taskService from './task.service';
import * as workflowService from './workflow.service';
import * as workflowRepositoryService from './workflow-repository.service';

describe('workflow-repository.service', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  describe('addRepository', () => {
    it('links a repository to a workflow', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const result = workflowRepositoryService.addRepository(db, wf.id, {
        path: '/home/user/project',
      });

      expect(result.workflow_id).toBe(wf.id);
      expect(result.repository_id).toMatch(/^rp_/);
      expect(result.added_at).toBeGreaterThan(0);
    });

    it('returns existing link on duplicate add', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const first = workflowRepositoryService.addRepository(db, wf.id, {
        path: '/home/user/project',
      });
      const second = workflowRepositoryService.addRepository(db, wf.id, {
        path: '/home/user/project',
      });

      expect(second.repository_id).toBe(first.repository_id);
      expect(second.added_at).toBe(first.added_at);
    });

    it('throws for missing workflow', () => {
      expect(() =>
        workflowRepositoryService.addRepository(db, 'wf_nonexistent', {
          path: '/home/user/project',
        }),
      ).toThrow(/Workflow not found/);
    });

    it('links multiple repos to same workflow', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      workflowRepositoryService.addRepository(db, wf.id, { path: '/repo/backend' });
      workflowRepositoryService.addRepository(db, wf.id, { path: '/repo/frontend' });

      const repos = workflowRepositoryService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(2);
    });
  });

  describe('removeRepository', () => {
    it('unlinks a repository from a workflow', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const link = workflowRepositoryService.addRepository(db, wf.id, {
        path: '/home/user/project',
      });

      workflowRepositoryService.removeRepository(db, wf.id, link.repository_id);

      const repos = workflowRepositoryService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(0);
    });

    it('throws for missing workflow', () => {
      expect(() =>
        workflowRepositoryService.removeRepository(db, 'wf_nonexistent', 'rp_test'),
      ).toThrow(/Workflow not found/);
    });

    it('throws when task references the repository', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const link = workflowRepositoryService.addRepository(db, wf.id, {
        path: '/home/user/project',
      });

      // Create a task that references this repository
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Task 1' }],
      });
      const tasks = db.prepare('SELECT id FROM tasks WHERE workflow_id = ?').all(wf.id) as Array<{
        id: string;
      }>;
      db.prepare('UPDATE tasks SET repository_id = ? WHERE id = ?').run(
        link.repository_id,
        tasks[0].id,
      );

      expect(() =>
        workflowRepositoryService.removeRepository(db, wf.id, link.repository_id),
      ).toThrow(/task.*still references/);
    });

    it('throws when workspace references the repository', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const link = workflowRepositoryService.addRepository(db, wf.id, {
        path: '/home/user/project',
      });

      // Create a workspace that references this repository
      db.prepare(
        'INSERT INTO workspaces (id, workflow_id, path, branch, status, repository_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        'ws_test123',
        wf.id,
        '/tmp/ws',
        'main',
        'active',
        link.repository_id,
        Date.now(),
        Date.now(),
      );

      expect(() =>
        workflowRepositoryService.removeRepository(db, wf.id, link.repository_id),
      ).toThrow(/workspace.*still references/);
    });
  });

  describe('listRepositories', () => {
    it('returns empty array for workflow with no repos', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const repos = workflowRepositoryService.listRepositories(db, wf.id);
      expect(repos).toEqual([]);
    });

    it('returns repositories with added_at timestamp', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      workflowRepositoryService.addRepository(db, wf.id, { path: '/repo/a' });
      workflowRepositoryService.addRepository(db, wf.id, { path: '/repo/b' });

      const repos = workflowRepositoryService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(2);
      for (const repo of repos) {
        expect(repo.id).toMatch(/^rp_/);
        expect(repo.path).toBeDefined();
        expect(repo.added_at).toBeGreaterThan(0);
      }
    });

    it('returns all linked repositories', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      workflowRepositoryService.addRepository(db, wf.id, { path: '/repo/first' });
      workflowRepositoryService.addRepository(db, wf.id, { path: '/repo/second' });

      const repos = workflowRepositoryService.listRepositories(db, wf.id);
      const paths = repos.map((r) => r.path).sort();
      expect(paths).toEqual(['/repo/first', '/repo/second']);
    });
  });
});
