import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Task } from '../types/task';
import * as workflowService from './workflow.service';
import * as workspaceService from './workspace.service';

function createWorkflowWithTasks(db: DatabaseType) {
  const wf = workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'issue',
  });
  workflowService.setPlan(db, wf.id, {
    summary: 'Test plan',
    tasks: [{ name: 'Task A' }, { name: 'Task B' }, { name: 'Task C' }],
  });
  const tasks = db
    .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
    .all(wf.id) as Task[];
  return { workflow: wf, tasks };
}

describe('workspaceService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- create ---

  describe('create', () => {
    it('creates a workspace with required fields', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      expect(ws.id).toMatch(/^ws_[0-9a-z]{12}$/);
      expect(ws.workflow_id).toBe(workflow.id);
      expect(ws.path).toBe('/tmp/worktree-1');
      expect(ws.branch).toBe('feature/task-a');
      expect(ws.status).toBe('active');
      expect(ws.merge_commit).toBeNull();
    });

    it('sets baseBranch when provided', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
        baseBranch: 'main',
      });

      expect(ws.base_branch).toBe('main');
    });

    it('defaults baseBranch to null', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      expect(ws.base_branch).toBeNull();
    });

    it('assigns tasks when taskIds provided', () => {
      const { workflow, tasks } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
        taskIds: [tasks[0].id, tasks[1].id],
      });

      const taskA = db.prepare('SELECT * FROM tasks WHERE id = ?').get(tasks[0].id) as Task;
      const taskB = db.prepare('SELECT * FROM tasks WHERE id = ?').get(tasks[1].id) as Task;
      const taskC = db.prepare('SELECT * FROM tasks WHERE id = ?').get(tasks[2].id) as Task;

      expect(taskA.workspace_id).toBe(ws.id);
      expect(taskB.workspace_id).toBe(ws.id);
      expect(taskC.workspace_id).toBeNull();
    });

    it('persists to database', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      const fetched = workspaceService.get(db, ws.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.path).toBe('/tmp/worktree-1');
    });

    it('throws when workflow not found', () => {
      expect(() =>
        workspaceService.create(db, {
          workflowId: 'wf_nonexistent',
          path: '/tmp/worktree-1',
          branch: 'feature/task-a',
        }),
      ).toThrow('Workflow not found');
    });

    it('throws when task not found in taskIds', () => {
      const { workflow } = createWorkflowWithTasks(db);
      expect(() =>
        workspaceService.create(db, {
          workflowId: workflow.id,
          path: '/tmp/worktree-1',
          branch: 'feature/task-a',
          taskIds: ['tk_nonexistent'],
        }),
      ).toThrow('Task not found');
    });

    it('is atomic — rolls back on task not found', () => {
      const { workflow, tasks } = createWorkflowWithTasks(db);
      try {
        workspaceService.create(db, {
          workflowId: workflow.id,
          path: '/tmp/worktree-1',
          branch: 'feature/task-a',
          taskIds: [tasks[0].id, 'tk_nonexistent'],
        });
      } catch {
        // expected
      }

      // No workspaces should have been created
      const workspaces = workspaceService.list(db, workflow.id);
      expect(workspaces).toHaveLength(0);

      // Task should not have been assigned
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(tasks[0].id) as Task;
      expect(task.workspace_id).toBeNull();
    });
  });

  // --- get ---

  describe('get', () => {
    it('returns workspace when found', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      const result = workspaceService.get(db, ws.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(ws.id);
    });

    it('returns null when not found', () => {
      const result = workspaceService.get(db, 'ws_nonexistent');
      expect(result).toBeNull();
    });
  });

  // --- update ---

  describe('update', () => {
    it('updates status', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      const updated = workspaceService.update(db, ws.id, { status: 'abandoned' });
      expect(updated.status).toBe('abandoned');
    });

    it('updates mergeCommit', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      const updated = workspaceService.update(db, ws.id, {
        status: 'merged',
        mergeCommit: 'abc123',
      });
      expect(updated.status).toBe('merged');
      expect(updated.merge_commit).toBe('abc123');
    });

    it('allows merged status when workspace already has merge_commit', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      // Set merge_commit first
      workspaceService.update(db, ws.id, { mergeCommit: 'abc123' });
      // Now set status to merged without providing mergeCommit again
      const updated = workspaceService.update(db, ws.id, { status: 'merged' });
      expect(updated.status).toBe('merged');
      expect(updated.merge_commit).toBe('abc123');
    });

    it('throws when setting merged without mergeCommit', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      expect(() => workspaceService.update(db, ws.id, { status: 'merged' })).toThrow(
        'mergeCommit is required',
      );
    });

    it('throws when workspace not found', () => {
      expect(() => workspaceService.update(db, 'ws_nonexistent', { status: 'abandoned' })).toThrow(
        'Workspace not found',
      );
    });

    it('updates the updated_at timestamp', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      const updated = workspaceService.update(db, ws.id, { status: 'abandoned' });
      expect(updated.updated_at).toBeGreaterThanOrEqual(ws.updated_at);
    });

    it('persists changes to database', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      workspaceService.update(db, ws.id, { status: 'abandoned' });
      const fetched = workspaceService.get(db, ws.id);
      expect(fetched?.status).toBe('abandoned');
    });
  });

  // --- list ---

  describe('list', () => {
    it('returns workspaces for a workflow', () => {
      const { workflow } = createWorkflowWithTasks(db);
      workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/a',
      });
      workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-2',
        branch: 'feature/b',
      });

      const result = workspaceService.list(db, workflow.id);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no workspaces', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const result = workspaceService.list(db, workflow.id);
      expect(result).toEqual([]);
    });

    it('filters by single status', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws1 = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/a',
      });
      workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-2',
        branch: 'feature/b',
      });

      workspaceService.update(db, ws1.id, { status: 'abandoned' });

      const result = workspaceService.list(db, workflow.id, 'active');
      expect(result).toHaveLength(1);
      expect(result[0].branch).toBe('feature/b');
    });

    it('filters by multiple statuses', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws1 = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/a',
      });
      const ws2 = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-2',
        branch: 'feature/b',
      });
      workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-3',
        branch: 'feature/c',
      });

      workspaceService.update(db, ws1.id, { status: 'abandoned' });
      workspaceService.update(db, ws2.id, {
        status: 'merged',
        mergeCommit: 'abc123',
      });

      const result = workspaceService.list(db, workflow.id, ['merged', 'abandoned']);
      expect(result).toHaveLength(2);
    });

    it('does not return workspaces from other workflows', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const wf2 = workflowService.create(db, {
        name: 'Other Workflow',
        source_type: 'issue',
      });

      workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/a',
      });
      workspaceService.create(db, {
        workflowId: wf2.id,
        path: '/tmp/worktree-2',
        branch: 'feature/b',
      });

      const result = workspaceService.list(db, workflow.id);
      expect(result).toHaveLength(1);
    });

    it('orders by created_at', () => {
      const { workflow } = createWorkflowWithTasks(db);
      workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/first',
      });
      workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-2',
        branch: 'feature/second',
      });

      const result = workspaceService.list(db, workflow.id);
      expect(result[0].branch).toBe('feature/first');
      expect(result[1].branch).toBe('feature/second');
    });
  });

  // --- assignTask ---

  describe('assignTask', () => {
    it('assigns a task to a workspace', () => {
      const { workflow, tasks } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      workspaceService.assignTask(db, tasks[0].id, ws.id);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(tasks[0].id) as Task;
      expect(task.workspace_id).toBe(ws.id);
    });

    it('throws when task not found', () => {
      const { workflow } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      expect(() => workspaceService.assignTask(db, 'tk_nonexistent', ws.id)).toThrow(
        'Task not found',
      );
    });

    it('throws when workspace not found', () => {
      const { tasks } = createWorkflowWithTasks(db);

      expect(() => workspaceService.assignTask(db, tasks[0].id, 'ws_nonexistent')).toThrow(
        'Workspace not found',
      );
    });

    it('throws when workspace is not active', () => {
      const { workflow, tasks } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      workspaceService.update(db, ws.id, { status: 'abandoned' });

      expect(() => workspaceService.assignTask(db, tasks[0].id, ws.id)).toThrow(
        "Cannot assign task to workspace with status 'abandoned'",
      );
    });

    it('updates task updated_at timestamp', () => {
      const { workflow, tasks } = createWorkflowWithTasks(db);
      const ws = workspaceService.create(db, {
        workflowId: workflow.id,
        path: '/tmp/worktree-1',
        branch: 'feature/task-a',
      });

      workspaceService.assignTask(db, tasks[0].id, ws.id);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(tasks[0].id) as Task;
      expect(task.updated_at).toBeGreaterThanOrEqual(tasks[0].updated_at);
    });
  });
});
