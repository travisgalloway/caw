import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Task } from '../types/task';
import { agentId } from '../utils/id';
import * as orchestrationService from './orchestration.service';
import * as workflowService from './workflow.service';

function createWorkflow(db: DatabaseType, name = 'Test Workflow', maxParallel = 2) {
  return workflowService.create(db, {
    name,
    source_type: 'issue',
    max_parallel_tasks: maxParallel,
  });
}

function getTasks(db: DatabaseType, workflowId: string): Task[] {
  return db
    .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence, name')
    .all(workflowId) as Task[];
}

function completeTask(db: DatabaseType, taskId: string) {
  db.prepare("UPDATE tasks SET status = 'completed', outcome = 'done' WHERE id = ?").run(taskId);
}

function skipTask(db: DatabaseType, taskId: string) {
  db.prepare("UPDATE tasks SET status = 'skipped' WHERE id = ?").run(taskId);
}

function failTask(db: DatabaseType, taskId: string) {
  db.prepare("UPDATE tasks SET status = 'failed', outcome_detail = 'error' WHERE id = ?").run(
    taskId,
  );
}

describe('orchestrationService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- getNextTasks ---

  describe('getNextTasks', () => {
    it('returns unblocked pending tasks', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'Setup' },
          { name: 'Build', depends_on: ['Setup'] },
          { name: 'Test', depends_on: ['Build'] },
        ],
      });

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].name).toBe('Setup');
    });

    it('returns multiple tasks when unblocked', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'Task A', parallel_group: 'group-1' },
          { name: 'Task B', parallel_group: 'group-1' },
          { name: 'Task C', depends_on: ['Task A', 'Task B'] },
        ],
      });

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(2);
      const names = result.tasks.map((t) => t.name);
      expect(names).toContain('Task A');
      expect(names).toContain('Task B');
    });

    it('enriches tasks with parallel info', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'Task A', parallel_group: 'group-1' },
          { name: 'Task B', parallel_group: 'group-1' },
        ],
      });

      const result = orchestrationService.getNextTasks(db, wf.id);
      const taskA = result.tasks.find((t) => t.name === 'Task A');
      const taskB = result.tasks.find((t) => t.name === 'Task B');

      expect(taskA?.can_parallelize).toBe(true);
      expect(taskA?.parallel_with).toHaveLength(1);
      expect(taskA?.parallel_with[0]).toBe(taskB?.id);
    });

    it('enriches tasks with completed dependencies', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Setup' }, { name: 'Build', depends_on: ['Setup'] }],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].name).toBe('Build');
      expect(result.tasks[0].dependencies_completed).toEqual(['Setup']);
    });

    it('respects max_parallel_tasks in recommended_count', () => {
      const wf = createWorkflow(db, 'Test', 1);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      });

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(3);
      expect(result.max_parallel).toBe(1);
      expect(result.recommended_count).toBe(1);
    });

    it('sets all_complete when all tasks done', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);
      skipTask(db, tasks[1].id);

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.all_complete).toBe(true);
      expect(result.tasks).toHaveLength(0);
    });

    it('returns all_complete false when tasks remain', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.all_complete).toBe(false);
    });

    it('excludes failed tasks by default', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }],
      });

      const tasks = getTasks(db, wf.id);
      failTask(db, tasks[0].id);

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].name).toBe('B');
    });

    it('includes failed tasks when includeFailed is true', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }],
      });

      const tasks = getTasks(db, wf.id);
      failTask(db, tasks[0].id);

      const result = orchestrationService.getNextTasks(db, wf.id, true);
      expect(result.tasks).toHaveLength(2);
      const names = result.tasks.map((t) => t.name);
      expect(names).toContain('A');
      expect(names).toContain('B');
    });

    it('excludes claimed tasks', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }],
      });

      // Create a real agent to satisfy foreign key constraint
      const aid = agentId();
      const now = Date.now();
      db.prepare(
        `INSERT INTO agents (id, name, runtime, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(aid, 'worker-1', 'claude_code', 'worker', 'busy', now, now);

      const tasks = getTasks(db, wf.id);
      db.prepare('UPDATE tasks SET assigned_agent_id = ? WHERE id = ?').run(aid, tasks[0].id);

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].name).toBe('B');
    });

    it('returns workflow_status', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }],
      });

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.workflow_status).toBe('ready');
    });

    it('handles empty workflow (no tasks)', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Empty plan',
        tasks: [],
      });

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(0);
      expect(result.all_complete).toBe(false);
      expect(result.recommended_count).toBe(0);
    });

    it('throws when workflow not found', () => {
      expect(() => orchestrationService.getNextTasks(db, 'wf_nonexistent')).toThrow(
        'Workflow not found',
      );
    });

    it('marks non-parallel-group tasks as can_parallelize false', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Solo' }],
      });

      const result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks[0].can_parallelize).toBe(false);
      expect(result.tasks[0].parallel_with).toEqual([]);
    });

    it('handles mixed dependencies and parallel groups', () => {
      const wf = createWorkflow(db, 'Test', 4);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'Init' },
          { name: 'Build A', depends_on: ['Init'], parallel_group: 'build' },
          { name: 'Build B', depends_on: ['Init'], parallel_group: 'build' },
          { name: 'Deploy', depends_on: ['Build A', 'Build B'] },
        ],
      });

      // Only Init should be available initially
      let result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].name).toBe('Init');

      // Complete Init -> Build A and Build B available
      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);

      result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(2);
      const names = result.tasks.map((t) => t.name);
      expect(names).toContain('Build A');
      expect(names).toContain('Build B');

      // Complete both builds -> Deploy available
      completeTask(db, tasks[1].id);
      completeTask(db, tasks[2].id);

      result = orchestrationService.getNextTasks(db, wf.id);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].name).toBe('Deploy');
    });
  });

  // --- getProgress ---

  describe('getProgress', () => {
    it('counts tasks by status', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);
      failTask(db, tasks[1].id);

      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.total_tasks).toBe(3);
      expect(progress.by_status.completed).toBe(1);
      expect(progress.by_status.failed).toBe(1);
      expect(progress.by_status.pending).toBe(1);
    });

    it('tracks completed_sequence', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B', depends_on: ['A'] }, { name: 'C', depends_on: ['B'] }],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);
      completeTask(db, tasks[1].id);

      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.completed_sequence).toBe(2);
    });

    it('tracks current_sequence', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B', depends_on: ['A'] }, { name: 'C', depends_on: ['B'] }],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);

      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.current_sequence).toBe(2);
    });

    it('identifies blocked tasks', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'Setup' },
          { name: 'Build', depends_on: ['Setup'] },
          { name: 'Test', depends_on: ['Build'] },
        ],
      });

      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.blocked_tasks).toHaveLength(2);

      const buildBlocked = progress.blocked_tasks.find((b) => b.name === 'Build');
      expect(buildBlocked?.blocked_by).toEqual(['Setup']);

      const testBlocked = progress.blocked_tasks.find((b) => b.name === 'Test');
      expect(testBlocked?.blocked_by).toEqual(['Build']);
    });

    it('tracks parallel group progress', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'A', parallel_group: 'group-1' },
          { name: 'B', parallel_group: 'group-1' },
          { name: 'C', parallel_group: 'group-2' },
        ],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);

      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.parallel_groups['group-1'].task_count).toBe(2);
      expect(progress.parallel_groups['group-1'].completed).toBe(1);
      expect(progress.parallel_groups['group-2'].task_count).toBe(1);
      expect(progress.parallel_groups['group-2'].completed).toBe(0);
    });

    it('calculates estimated_remaining', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);
      skipTask(db, tasks[1].id);

      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.estimated_remaining).toBe(1);
    });

    it('handles empty workflow', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Empty',
        tasks: [],
      });

      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.total_tasks).toBe(0);
      expect(progress.by_status).toEqual({});
      expect(progress.completed_sequence).toBe(0);
      expect(progress.current_sequence).toBe(0);
      expect(progress.blocked_tasks).toEqual([]);
      expect(progress.parallel_groups).toEqual({});
      expect(progress.estimated_remaining).toBe(0);
    });

    it('throws when workflow not found', () => {
      expect(() => orchestrationService.getProgress(db, 'wf_nonexistent')).toThrow(
        'Workflow not found',
      );
    });

    it('treats skipped tasks as completed for sequence tracking', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }],
      });

      const tasks = getTasks(db, wf.id);
      skipTask(db, tasks[0].id);
      completeTask(db, tasks[1].id);

      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.completed_sequence).toBe(2);
      expect(progress.estimated_remaining).toBe(0);
    });
  });

  // --- checkDependencies ---

  describe('checkDependencies', () => {
    it('returns satisfied when no blocking deps', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Solo' }],
      });

      const tasks = getTasks(db, wf.id);
      const result = orchestrationService.checkDependencies(db, tasks[0].id);
      expect(result.satisfied).toBe(true);
      expect(result.pending).toEqual([]);
      expect(result.completed).toEqual([]);
    });

    it('returns satisfied when all deps are completed', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Setup' }, { name: 'Build', depends_on: ['Setup'] }],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);

      const result = orchestrationService.checkDependencies(db, tasks[1].id);
      expect(result.satisfied).toBe(true);
      expect(result.completed).toHaveLength(1);
      expect(result.completed[0].name).toBe('Setup');
      expect(result.completed[0].outcome).toBe('done');
    });

    it('returns not satisfied when deps are pending', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Setup' }, { name: 'Build', depends_on: ['Setup'] }],
      });

      const tasks = getTasks(db, wf.id);
      const result = orchestrationService.checkDependencies(db, tasks[1].id);
      expect(result.satisfied).toBe(false);
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].name).toBe('Setup');
      expect(result.pending[0].status).toBe('pending');
    });

    it('handles mix of completed and pending deps', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }, { name: 'C', depends_on: ['A', 'B'] }],
      });

      const tasks = getTasks(db, wf.id);
      completeTask(db, tasks[0].id);

      const result = orchestrationService.checkDependencies(db, tasks[2].id);
      expect(result.satisfied).toBe(false);
      expect(result.completed).toHaveLength(1);
      expect(result.completed[0].name).toBe('A');
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].name).toBe('B');
    });

    it('treats skipped deps as satisfied', () => {
      const wf = createWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Setup' }, { name: 'Build', depends_on: ['Setup'] }],
      });

      const tasks = getTasks(db, wf.id);
      skipTask(db, tasks[0].id);

      const result = orchestrationService.checkDependencies(db, tasks[1].id);
      expect(result.satisfied).toBe(true);
      expect(result.completed).toHaveLength(1);
    });

    it('throws when task not found', () => {
      expect(() => orchestrationService.checkDependencies(db, 'tk_nonexistent')).toThrow(
        'Task not found',
      );
    });
  });
});
