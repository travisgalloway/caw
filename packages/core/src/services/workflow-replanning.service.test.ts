import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import * as agentService from './agent.service';
import * as taskService from './task.service';
import * as workflowService from './workflow.service';
import * as replanningService from './workflow-replanning.service';

function createTestWorkflow(db: DatabaseType, status: string = 'in_progress') {
  const wf = workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'prompt',
  });
  workflowService.setPlan(db, wf.id, {
    summary: 'Test plan',
    tasks: [
      { name: 'Task A' },
      { name: 'Task B', depends_on: ['Task A'] },
      { name: 'Task C', depends_on: ['Task B'] },
    ],
  });
  if (status === 'in_progress') {
    workflowService.updateStatus(db, wf.id, 'in_progress');
  }
  return wf;
}

function getTaskIds(db: DatabaseType, workflowId: string) {
  return db
    .prepare('SELECT id, name, sequence FROM tasks WHERE workflow_id = ? ORDER BY sequence')
    .all(workflowId) as Array<{ id: string; name: string; sequence: number }>;
}

function getDeps(db: DatabaseType, taskId: string) {
  return db
    .prepare('SELECT depends_on_id FROM task_dependencies WHERE task_id = ?')
    .all(taskId) as Array<{ depends_on_id: string }>;
}

describe('workflow-replanning.service', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- addTask ---

  describe('addTask', () => {
    it('adds a task to an in_progress workflow', () => {
      const wf = createTestWorkflow(db);
      const result = replanningService.addTask(db, wf.id, {
        name: 'Task D',
        description: 'New task',
      });

      expect(result.task_id).toMatch(/^tk_/);
      expect(result.workflow_id).toBe(wf.id);
      expect(result.sequence).toBe(4);
    });

    it('adds a task after a specific task', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);

      const result = replanningService.addTask(db, wf.id, {
        name: 'Task A.5',
        after_task: tasks[0].name,
      });

      expect(result.sequence).toBe(2);

      // Verify subsequent tasks were shifted
      const updated = getTaskIds(db, wf.id);
      const taskB = updated.find((t) => t.name === 'Task B');
      expect(taskB?.sequence).toBe(3);
    });

    it('adds a task with dependencies', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);

      const result = replanningService.addTask(db, wf.id, {
        name: 'Task D',
        depends_on: ['Task A'],
      });

      const deps = getDeps(db, result.task_id);
      expect(deps).toHaveLength(1);
      expect(deps[0].depends_on_id).toBe(tasks[0].id);
    });

    it('adds a task with context fields', () => {
      const wf = createTestWorkflow(db);
      replanningService.addTask(db, wf.id, {
        name: 'Task D',
        estimated_complexity: 'high',
        files_likely_affected: ['src/index.ts'],
        parallel_group: 'group1',
      });

      const tasks = getTaskIds(db, wf.id);
      const taskD = tasks.find((t) => t.name === 'Task D');
      expect(taskD).toBeDefined();

      const full = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskD!.id) as {
        context: string | null;
        parallel_group: string | null;
      };
      expect(full.parallel_group).toBe('group1');
      const ctx = JSON.parse(full.context!);
      expect(ctx.estimated_complexity).toBe('high');
      expect(ctx.files_likely_affected).toEqual(['src/index.ts']);
    });

    it('rejects duplicate task name', () => {
      const wf = createTestWorkflow(db);
      expect(() => replanningService.addTask(db, wf.id, { name: 'Task A' })).toThrow(
        /Duplicate task name/,
      );
    });

    it('rejects self-dependency', () => {
      const wf = createTestWorkflow(db);
      expect(() =>
        replanningService.addTask(db, wf.id, {
          name: 'Task D',
          depends_on: ['Task D'],
        }),
      ).toThrow(/cannot depend on itself/);
    });

    it('rejects unknown dependency', () => {
      const wf = createTestWorkflow(db);
      expect(() =>
        replanningService.addTask(db, wf.id, {
          name: 'Task D',
          depends_on: ['NonExistent'],
        }),
      ).toThrow(/Unknown dependency/);
    });

    it('rejects when workflow not found', () => {
      expect(() => replanningService.addTask(db, 'wf_nonexistent', { name: 'Task' })).toThrow(
        /Workflow not found/,
      );
    });

    it('rejects when workflow status is planning', () => {
      const wf = workflowService.create(db, {
        name: 'Planning WF',
        source_type: 'prompt',
      });
      expect(() => replanningService.addTask(db, wf.id, { name: 'Task' })).toThrow(
        /Cannot modify plan/,
      );
    });

    it('rejects when workflow status is completed', () => {
      const wf = createTestWorkflow(db);
      // Complete all tasks to allow workflow completion
      const tasks = getTaskIds(db, wf.id);
      for (const t of tasks) {
        taskService.updateStatus(db, t.id, 'planning');
        taskService.updateStatus(db, t.id, 'in_progress');
        taskService.updateStatus(db, t.id, 'completed', { outcome: 'Done' });
      }
      workflowService.updateStatus(db, wf.id, 'completed');

      expect(() => replanningService.addTask(db, wf.id, { name: 'Task' })).toThrow(
        /Cannot modify plan/,
      );
    });

    it('allows adding to a paused workflow', () => {
      const wf = createTestWorkflow(db);
      workflowService.updateStatus(db, wf.id, 'paused');

      const result = replanningService.addTask(db, wf.id, { name: 'Paused Task' });
      expect(result.task_id).toMatch(/^tk_/);
    });

    it('rejects invalid after_task reference', () => {
      const wf = createTestWorkflow(db);
      expect(() =>
        replanningService.addTask(db, wf.id, {
          name: 'Task D',
          after_task: 'NonExistent',
        }),
      ).toThrow(/Task not found for after_task/);
    });

    it('handles repository_path by registering repo', () => {
      const wf = createTestWorkflow(db);
      replanningService.addTask(db, wf.id, {
        name: 'Task D',
        repository_path: '/home/user/project',
      });

      const repos = db
        .prepare(
          'SELECT r.path FROM workflow_repositories wr JOIN repositories r ON r.id = wr.repository_id WHERE wr.workflow_id = ?',
        )
        .all(wf.id) as Array<{ path: string }>;
      expect(repos.some((r) => r.path === '/home/user/project')).toBe(true);
    });

    it('deduplicates dependencies', () => {
      const wf = createTestWorkflow(db);
      // Pass same dep twice
      const result = replanningService.addTask(db, wf.id, {
        name: 'Task D',
        depends_on: ['Task A', 'Task A'],
      });

      const deps = getDeps(db, result.task_id);
      expect(deps).toHaveLength(1);
    });
  });

  // --- removeTask ---

  describe('removeTask', () => {
    it('removes a pending task', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      // Task C is pending (depends on B which depends on A)
      const taskC = tasks.find((t) => t.name === 'Task C')!;

      const result = replanningService.removeTask(db, wf.id, taskC.id);
      expect(result.removed_task_id).toBe(taskC.id);

      const remaining = getTaskIds(db, wf.id);
      expect(remaining).toHaveLength(2);
    });

    it('rewires dependencies when removing middle task', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      const taskB = tasks.find((t) => t.name === 'Task B')!;
      const taskC = tasks.find((t) => t.name === 'Task C')!;
      const taskA = tasks.find((t) => t.name === 'Task A')!;

      const result = replanningService.removeTask(db, wf.id, taskB.id);
      expect(result.dependencies_rewired).toBe(1);

      // Task C should now depend on Task A
      const deps = getDeps(db, taskC.id);
      expect(deps).toHaveLength(1);
      expect(deps[0].depends_on_id).toBe(taskA.id);
    });

    it('renumbers subsequent tasks', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      const taskA = tasks.find((t) => t.name === 'Task A')!;

      replanningService.removeTask(db, wf.id, taskA.id);

      const remaining = getTaskIds(db, wf.id);
      expect(remaining[0].sequence).toBe(1);
      expect(remaining[1].sequence).toBe(2);
    });

    it('rejects removing an in_progress task', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      const taskA = tasks.find((t) => t.name === 'Task A')!;

      taskService.updateStatus(db, taskA.id, 'planning');
      taskService.updateStatus(db, taskA.id, 'in_progress');

      expect(() => replanningService.removeTask(db, wf.id, taskA.id)).toThrow(/Cannot remove task/);
    });

    it('rejects removing a completed task', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      const taskA = tasks.find((t) => t.name === 'Task A')!;

      taskService.updateStatus(db, taskA.id, 'planning');
      taskService.updateStatus(db, taskA.id, 'in_progress');
      taskService.updateStatus(db, taskA.id, 'completed', { outcome: 'Done' });

      expect(() => replanningService.removeTask(db, wf.id, taskA.id)).toThrow(/Cannot remove task/);
    });

    it('rejects removing a claimed task', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      const taskA = tasks.find((t) => t.name === 'Task A')!;

      // Register an agent and claim the task
      const agent = agentService.register(db, {
        name: 'Agent',
        runtime: 'claude',
        workflow_id: wf.id,
      });
      taskService.claim(db, taskA.id, agent.id);

      expect(() => replanningService.removeTask(db, wf.id, taskA.id)).toThrow(/task is claimed/);
    });

    it('rejects removing from wrong workflow', () => {
      const wf = createTestWorkflow(db);
      expect(() => replanningService.removeTask(db, wf.id, 'tk_nonexistent')).toThrow(
        /Task not found/,
      );
    });

    it('rejects when workflow not found', () => {
      expect(() => replanningService.removeTask(db, 'wf_nonexistent', 'tk_test')).toThrow(
        /Workflow not found/,
      );
    });

    it('deletes checkpoints for removed task', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      const taskA = tasks.find((t) => t.name === 'Task A')!;

      // Add a checkpoint
      db.prepare(
        'INSERT INTO checkpoints (id, task_id, checkpoint_type, summary, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('cp_test123', taskA.id, 'progress', 'test', 1, Date.now());

      replanningService.removeTask(db, wf.id, taskA.id);

      const checkpoints = db.prepare('SELECT * FROM checkpoints WHERE task_id = ?').all(taskA.id);
      expect(checkpoints).toHaveLength(0);
    });
  });

  // --- replan ---

  describe('replan', () => {
    it('replans a workflow by removing pending tasks and adding new ones', () => {
      const wf = createTestWorkflow(db);

      const result = replanningService.replan(db, wf.id, {
        summary: 'New plan',
        reason: 'Requirements changed',
        tasks: [{ name: 'New Task 1' }, { name: 'New Task 2', depends_on: ['New Task 1'] }],
      });

      expect(result.workflow_id).toBe(wf.id);
      expect(result.tasks_added).toBe(2);
      expect(result.tasks_removed).toBe(3);
      expect(result.tasks_preserved).toBe(0);
    });

    it('preserves in_progress tasks during replan', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      const taskA = tasks.find((t) => t.name === 'Task A')!;

      // Put Task A in progress
      taskService.updateStatus(db, taskA.id, 'planning');
      taskService.updateStatus(db, taskA.id, 'in_progress');

      const result = replanningService.replan(db, wf.id, {
        summary: 'Revised plan',
        reason: 'Mid-flight change',
        tasks: [{ name: 'New Task' }],
      });

      expect(result.tasks_preserved).toBe(1);
      expect(result.tasks_removed).toBe(2);
      expect(result.tasks_added).toBe(1);

      const remaining = getTaskIds(db, wf.id);
      expect(remaining.some((t) => t.name === 'Task A')).toBe(true);
      expect(remaining.some((t) => t.name === 'New Task')).toBe(true);
    });

    it('rejects name collision with preserved task', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      const taskA = tasks.find((t) => t.name === 'Task A')!;

      taskService.updateStatus(db, taskA.id, 'planning');
      taskService.updateStatus(db, taskA.id, 'in_progress');

      expect(() =>
        replanningService.replan(db, wf.id, {
          summary: 'Conflict',
          reason: 'Test',
          tasks: [{ name: 'Task A' }],
        }),
      ).toThrow(/conflicts with a preserved task/);
    });

    it('rejects duplicate names in new tasks', () => {
      const wf = createTestWorkflow(db);
      expect(() =>
        replanningService.replan(db, wf.id, {
          summary: 'Dupe',
          reason: 'Test',
          tasks: [{ name: 'Same' }, { name: 'Same' }],
        }),
      ).toThrow(/Duplicate task name/);
    });

    it('rejects self-dependency in new tasks', () => {
      const wf = createTestWorkflow(db);
      expect(() =>
        replanningService.replan(db, wf.id, {
          summary: 'Self dep',
          reason: 'Test',
          tasks: [{ name: 'Loop', depends_on: ['Loop'] }],
        }),
      ).toThrow(/cannot depend on itself/);
    });

    it('rejects unknown dependency in new tasks', () => {
      const wf = createTestWorkflow(db);
      expect(() =>
        replanningService.replan(db, wf.id, {
          summary: 'Bad dep',
          reason: 'Test',
          tasks: [{ name: 'T1', depends_on: ['Ghost'] }],
        }),
      ).toThrow(/Unknown dependency/);
    });

    it('updates plan_summary and config with replan history', () => {
      const wf = createTestWorkflow(db);
      replanningService.replan(db, wf.id, {
        summary: 'Revised plan',
        reason: 'Scope change',
        tasks: [{ name: 'New Task' }],
      });

      const updated = workflowService.get(db, wf.id);
      expect(updated?.plan_summary).toBe('Revised plan');

      const config = JSON.parse(updated!.config!);
      expect(config.replan_history).toHaveLength(1);
      expect(config.replan_history[0].summary).toBe('Revised plan');
      expect(config.replan_history[0].reason).toBe('Scope change');
    });

    it('allows new tasks to depend on preserved tasks', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      const taskA = tasks.find((t) => t.name === 'Task A')!;

      taskService.updateStatus(db, taskA.id, 'planning');
      taskService.updateStatus(db, taskA.id, 'in_progress');

      const result = replanningService.replan(db, wf.id, {
        summary: 'Dep on preserved',
        reason: 'Test',
        tasks: [{ name: 'After A', depends_on: ['Task A'] }],
      });

      expect(result.tasks_added).toBe(1);

      const allTasks = getTaskIds(db, wf.id);
      const afterA = allTasks.find((t) => t.name === 'After A')!;
      const deps = getDeps(db, afterA.id);
      expect(deps).toHaveLength(1);
      expect(deps[0].depends_on_id).toBe(taskA.id);
    });

    it('resolves context_from references', () => {
      const wf = createTestWorkflow(db);

      replanningService.replan(db, wf.id, {
        summary: 'Context from',
        reason: 'Test',
        tasks: [{ name: 'Source' }, { name: 'Consumer', context_from: ['Source'] }],
      });

      const allTasks = db
        .prepare('SELECT id, name, context_from FROM tasks WHERE workflow_id = ? ORDER BY sequence')
        .all(wf.id) as Array<{ id: string; name: string; context_from: string | null }>;

      const source = allTasks.find((t) => t.name === 'Source')!;
      const consumer = allTasks.find((t) => t.name === 'Consumer')!;
      expect(consumer.context_from).toBeDefined();
      const refs = JSON.parse(consumer.context_from!);
      expect(refs).toContain(source.id);
    });

    it('rejects invalid context_from reference', () => {
      const wf = createTestWorkflow(db);
      expect(() =>
        replanningService.replan(db, wf.id, {
          summary: 'Bad ctx',
          reason: 'Test',
          tasks: [{ name: 'T1', context_from: ['Ghost'] }],
        }),
      ).toThrow(/Unknown context_from reference/);
    });

    it('rejects replan on completed workflow', () => {
      const wf = createTestWorkflow(db);
      const tasks = getTaskIds(db, wf.id);
      for (const t of tasks) {
        taskService.updateStatus(db, t.id, 'planning');
        taskService.updateStatus(db, t.id, 'in_progress');
        taskService.updateStatus(db, t.id, 'completed', { outcome: 'Done' });
      }
      workflowService.updateStatus(db, wf.id, 'completed');

      expect(() =>
        replanningService.replan(db, wf.id, {
          summary: 'Too late',
          reason: 'Test',
          tasks: [],
        }),
      ).toThrow(/Cannot modify plan/);
    });

    it('handles empty task list (remove all pending)', () => {
      const wf = createTestWorkflow(db);
      const result = replanningService.replan(db, wf.id, {
        summary: 'Clear all',
        reason: 'Test',
        tasks: [],
      });

      expect(result.tasks_removed).toBe(3);
      expect(result.tasks_added).toBe(0);
      expect(getTaskIds(db, wf.id)).toHaveLength(0);
    });

    it('deduplicates dependencies in new tasks', () => {
      const wf = createTestWorkflow(db);
      replanningService.replan(db, wf.id, {
        summary: 'Dedup',
        reason: 'Test',
        tasks: [{ name: 'Base' }, { name: 'Child', depends_on: ['Base', 'Base'] }],
      });

      const allTasks = getTaskIds(db, wf.id);
      const child = allTasks.find((t) => t.name === 'Child')!;
      const deps = getDeps(db, child.id);
      expect(deps).toHaveLength(1);
    });
  });
});
