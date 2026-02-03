import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Task } from '../types/task';
import { agentId } from '../utils/id';
import * as checkpointService from './checkpoint.service';
import * as taskService from './task.service';
import * as workflowService from './workflow.service';

interface SetupResult {
  workflowId: string;
  tasks: Task[];
}

function setupChainedTasks(db: DatabaseType): SetupResult {
  const wf = workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'issue',
  });
  workflowService.setPlan(db, wf.id, {
    summary: 'Test plan',
    tasks: [
      { name: 'Setup' },
      { name: 'Build', depends_on: ['Setup'] },
      { name: 'Test', depends_on: ['Build'] },
    ],
  });
  const tasks = db
    .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
    .all(wf.id) as Task[];
  return { workflowId: wf.id, tasks };
}

function createAgent(db: DatabaseType, name = 'worker-1'): string {
  const id = agentId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO agents (id, name, runtime, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, 'claude_code', 'worker', 'online', now, now);
  return id;
}

describe('taskService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- get ---

  describe('get', () => {
    it('returns task when found', () => {
      const { tasks } = setupChainedTasks(db);
      const result = taskService.get(db, tasks[0].id);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Setup');
    });

    it('returns null when not found', () => {
      const result = taskService.get(db, 'tk_nonexistent');
      expect(result).toBeNull();
    });

    it('returns empty checkpoints by default', () => {
      const { tasks } = setupChainedTasks(db);
      const result = taskService.get(db, tasks[0].id);
      expect(result?.checkpoints).toEqual([]);
    });

    it('includes checkpoints when requested', () => {
      const { tasks } = setupChainedTasks(db);
      checkpointService.add(db, tasks[0].id, { type: 'plan', summary: 'Planned' });
      checkpointService.add(db, tasks[0].id, { type: 'progress', summary: 'Working' });

      const result = taskService.get(db, tasks[0].id, { includeCheckpoints: true });
      expect(result?.checkpoints).toHaveLength(2);
    });

    it('respects checkpoint limit', () => {
      const { tasks } = setupChainedTasks(db);
      for (let i = 0; i < 5; i++) {
        checkpointService.add(db, tasks[0].id, { type: 'progress', summary: `Step ${i}` });
      }

      const result = taskService.get(db, tasks[0].id, {
        includeCheckpoints: true,
        checkpointLimit: 2,
      });
      expect(result?.checkpoints).toHaveLength(2);
    });
  });

  // --- isBlocked ---

  describe('isBlocked', () => {
    it('returns false when no dependencies', () => {
      const { tasks } = setupChainedTasks(db);
      expect(taskService.isBlocked(db, tasks[0].id)).toBe(false);
    });

    it('returns true when dependency is incomplete', () => {
      const { tasks } = setupChainedTasks(db);
      expect(taskService.isBlocked(db, tasks[1].id)).toBe(true);
    });

    it('returns false when all blocking deps are completed', () => {
      const { tasks } = setupChainedTasks(db);
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(tasks[0].id);
      expect(taskService.isBlocked(db, tasks[1].id)).toBe(false);
    });

    it('returns false when blocking dep is skipped', () => {
      const { tasks } = setupChainedTasks(db);
      db.prepare("UPDATE tasks SET status = 'skipped' WHERE id = ?").run(tasks[0].id);
      expect(taskService.isBlocked(db, tasks[1].id)).toBe(false);
    });

    it('ignores informs-only dependencies', () => {
      const wf = workflowService.create(db, {
        name: 'Inform Test',
        source_type: 'issue',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }],
      });
      const tasks = db
        .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
        .all(wf.id) as Task[];

      // Manually insert an 'informs' dependency
      db.prepare(
        "INSERT INTO task_dependencies (task_id, depends_on_id, dependency_type) VALUES (?, ?, 'informs')",
      ).run(tasks[1].id, tasks[0].id);

      expect(taskService.isBlocked(db, tasks[1].id)).toBe(false);
    });
  });

  // --- getDependencies ---

  describe('getDependencies', () => {
    it('returns dependencies in both directions', () => {
      const { tasks } = setupChainedTasks(db);

      // Build depends on Setup
      const buildDeps = taskService.getDependencies(db, tasks[1].id);
      expect(buildDeps.dependencies).toHaveLength(1);
      expect(buildDeps.dependencies[0].depends_on_id).toBe(tasks[0].id);

      // Setup is depended on by Build
      const setupDeps = taskService.getDependencies(db, tasks[0].id);
      expect(setupDeps.dependents).toHaveLength(1);
      expect(setupDeps.dependents[0].task_id).toBe(tasks[1].id);
    });

    it('returns empty arrays when no dependencies', () => {
      const wf = workflowService.create(db, {
        name: 'No Deps',
        source_type: 'issue',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Solo' }],
      });
      const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as Task[];

      const deps = taskService.getDependencies(db, tasks[0].id);
      expect(deps.dependencies).toEqual([]);
      expect(deps.dependents).toEqual([]);
    });
  });

  // --- updateStatus ---

  describe('updateStatus', () => {
    it('transitions pending → planning (when not blocked)', () => {
      const { tasks } = setupChainedTasks(db);
      const updated = taskService.updateStatus(db, tasks[0].id, 'planning');
      expect(updated.status).toBe('planning');
    });

    it('transitions planning → in_progress', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      const updated = taskService.updateStatus(db, tasks[0].id, 'in_progress');
      expect(updated.status).toBe('in_progress');
    });

    it('transitions planning → completed (with outcome)', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      const updated = taskService.updateStatus(db, tasks[0].id, 'completed', {
        outcome: 'Setup done',
      });
      expect(updated.status).toBe('completed');
      expect(updated.outcome).toBe('Setup done');
    });

    it('transitions in_progress → completed (with outcome)', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      const updated = taskService.updateStatus(db, tasks[0].id, 'completed', {
        outcome: 'All done',
      });
      expect(updated.status).toBe('completed');
      expect(updated.outcome).toBe('All done');
    });

    it('transitions in_progress → paused', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      const updated = taskService.updateStatus(db, tasks[0].id, 'paused');
      expect(updated.status).toBe('paused');
    });

    it('transitions paused → in_progress', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      taskService.updateStatus(db, tasks[0].id, 'paused');
      const updated = taskService.updateStatus(db, tasks[0].id, 'in_progress');
      expect(updated.status).toBe('in_progress');
    });

    it('transitions in_progress → failed (with error)', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      const updated = taskService.updateStatus(db, tasks[0].id, 'failed', {
        error: 'Build failed',
      });
      expect(updated.status).toBe('failed');
      expect(updated.outcome_detail).toBe('Build failed');
    });

    it('transitions failed → pending (replan)', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      taskService.updateStatus(db, tasks[0].id, 'failed', { error: 'oops' });
      const updated = taskService.updateStatus(db, tasks[0].id, 'pending');
      expect(updated.status).toBe('pending');
    });

    it('transitions failed → skipped', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      taskService.updateStatus(db, tasks[0].id, 'failed', { error: 'oops' });
      const updated = taskService.updateStatus(db, tasks[0].id, 'skipped');
      expect(updated.status).toBe('skipped');
    });

    it('rejects invalid transitions', () => {
      const { tasks } = setupChainedTasks(db);
      expect(() =>
        taskService.updateStatus(db, tasks[0].id, 'completed', { outcome: 'x' }),
      ).toThrow('Invalid transition');
    });

    it('rejects completed → any transition', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'completed', { outcome: 'done' });
      expect(() => taskService.updateStatus(db, tasks[0].id, 'in_progress')).toThrow(
        'Invalid transition',
      );
    });

    it('rejects skipped → any transition', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      taskService.updateStatus(db, tasks[0].id, 'failed', { error: 'x' });
      taskService.updateStatus(db, tasks[0].id, 'skipped');
      expect(() => taskService.updateStatus(db, tasks[0].id, 'pending')).toThrow(
        'Invalid transition',
      );
    });

    it('rejects pending → planning when blocked', () => {
      const { tasks } = setupChainedTasks(db);
      // tasks[1] (Build) depends on tasks[0] (Setup) which is still pending
      expect(() => taskService.updateStatus(db, tasks[1].id, 'planning')).toThrow(
        'incomplete blocking dependencies',
      );
    });

    it('requires outcome for completed status', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      expect(() => taskService.updateStatus(db, tasks[0].id, 'completed')).toThrow(
        'Outcome is required',
      );
    });

    it('requires error for failed status', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      expect(() => taskService.updateStatus(db, tasks[0].id, 'failed')).toThrow(
        'Error is required',
      );
    });

    it('throws when task not found', () => {
      expect(() => taskService.updateStatus(db, 'tk_nonexistent', 'planning')).toThrow(
        'Task not found',
      );
    });

    it('updates the updated_at timestamp', () => {
      const { tasks } = setupChainedTasks(db);
      const updated = taskService.updateStatus(db, tasks[0].id, 'planning');
      expect(updated.updated_at).toBeGreaterThanOrEqual(tasks[0].updated_at);
    });
  });

  // --- setPlan ---

  describe('setPlan', () => {
    it('sets plan JSON on task', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');

      const updated = taskService.setPlan(db, tasks[0].id, {
        plan: { steps: ['install', 'configure'] },
      });

      const plan = JSON.parse(updated.plan as string);
      expect(plan.steps).toEqual(['install', 'configure']);
    });

    it('merges context with existing context', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');

      const updated = taskService.setPlan(db, tasks[0].id, {
        plan: { steps: [] },
        context: { approach: 'incremental' },
      });

      const context = JSON.parse(updated.context as string);
      expect(context.approach).toBe('incremental');
    });

    it('preserves existing context when merging', () => {
      const { tasks } = setupChainedTasks(db);
      // Task already has context from workflow setPlan (estimated_complexity etc.)
      // Set a known context first
      db.prepare('UPDATE tasks SET context = ? WHERE id = ?').run(
        JSON.stringify({ existing: 'value' }),
        tasks[0].id,
      );

      taskService.updateStatus(db, tasks[0].id, 'planning');
      const updated = taskService.setPlan(db, tasks[0].id, {
        plan: { steps: [] },
        context: { newKey: 'newValue' },
      });

      const context = JSON.parse(updated.context as string);
      expect(context.existing).toBe('value');
      expect(context.newKey).toBe('newValue');
    });

    it('throws when task is not in planning status', () => {
      const { tasks } = setupChainedTasks(db);
      // Task is in 'pending' status
      expect(() =>
        taskService.setPlan(db, tasks[0].id, {
          plan: { steps: [] },
        }),
      ).toThrow("Cannot set plan: task status is 'pending', expected 'planning'");
    });

    it('throws when task not found', () => {
      expect(() =>
        taskService.setPlan(db, 'tk_nonexistent', {
          plan: { steps: [] },
        }),
      ).toThrow('Task not found');
    });
  });

  // --- replan ---

  describe('replan', () => {
    it('creates checkpoint and resets to pending', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      taskService.updateStatus(db, tasks[0].id, 'failed', { error: 'Build failed' });

      const result = taskService.replan(db, tasks[0].id, 'New approach needed', {
        steps: ['retry with different config'],
      });

      expect(result.task.status).toBe('pending');
      expect(result.task.outcome).toBeNull();
      expect(result.task.outcome_detail).toBeNull();
      expect(result.checkpoint_id).toMatch(/^cp_[0-9a-z]{12}$/);

      const plan = JSON.parse(result.task.plan as string);
      expect(plan.steps).toEqual(['retry with different config']);
    });

    it('creates replan checkpoint with reason', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      taskService.updateStatus(db, tasks[0].id, 'failed', { error: 'oops' });

      const result = taskService.replan(db, tasks[0].id, 'Changing strategy', { steps: [] });

      const checkpoints = checkpointService.list(db, tasks[0].id);
      const replanCp = checkpoints.find((cp) => cp.id === result.checkpoint_id);
      expect(replanCp?.checkpoint_type).toBe('replan');
      expect(replanCp?.summary).toBe('Changing strategy');
    });

    it('allows replan from in_progress status', () => {
      const { tasks } = setupChainedTasks(db);
      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');

      const result = taskService.replan(db, tasks[0].id, 'Mid-task pivot', { steps: [] });
      expect(result.task.status).toBe('pending');
    });

    it('throws for invalid source status', () => {
      const { tasks } = setupChainedTasks(db);
      // Task is in 'pending' status
      expect(() => taskService.replan(db, tasks[0].id, 'No good reason', { steps: [] })).toThrow(
        "Cannot replan: task status is 'pending', expected 'failed' or 'in_progress'",
      );
    });

    it('throws when task not found', () => {
      expect(() => taskService.replan(db, 'tk_nonexistent', 'reason', { steps: [] })).toThrow(
        'Task not found',
      );
    });
  });

  // --- claim ---

  describe('claim', () => {
    it('successfully claims an unclaimed task', () => {
      const { tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      const result = taskService.claim(db, tasks[0].id, aid);
      expect(result.success).toBe(true);

      const task = taskService.get(db, tasks[0].id);
      expect(task?.assigned_agent_id).toBe(aid);
      expect(task?.claimed_at).toBeGreaterThan(0);
    });

    it('updates agent status to busy', () => {
      const { tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      taskService.claim(db, tasks[0].id, aid);

      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(aid) as {
        status: string;
        current_task_id: string;
      };
      expect(agent.status).toBe('busy');
      expect(agent.current_task_id).toBe(tasks[0].id);
    });

    it('returns already_claimed_by when claimed by different agent', () => {
      const { tasks } = setupChainedTasks(db);
      const aid1 = createAgent(db, 'worker-1');
      const aid2 = createAgent(db, 'worker-2');

      taskService.claim(db, tasks[0].id, aid1);
      const result = taskService.claim(db, tasks[0].id, aid2);
      expect(result.success).toBe(false);
      expect(result.already_claimed_by).toBe(aid1);
    });

    it('is idempotent for same agent', () => {
      const { tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      taskService.claim(db, tasks[0].id, aid);
      const result = taskService.claim(db, tasks[0].id, aid);
      expect(result.success).toBe(true);
    });

    it('rejects claim on completed task', () => {
      const { tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'completed', { outcome: 'done' });

      expect(() => taskService.claim(db, tasks[0].id, aid)).toThrow(
        "Cannot claim task in 'completed' status",
      );
    });

    it('rejects claim on skipped task', () => {
      const { tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      taskService.updateStatus(db, tasks[0].id, 'planning');
      taskService.updateStatus(db, tasks[0].id, 'in_progress');
      taskService.updateStatus(db, tasks[0].id, 'failed', { error: 'x' });
      taskService.updateStatus(db, tasks[0].id, 'skipped');

      expect(() => taskService.claim(db, tasks[0].id, aid)).toThrow(
        "Cannot claim task in 'skipped' status",
      );
    });

    it('throws when task not found', () => {
      const aid = createAgent(db);
      expect(() => taskService.claim(db, 'tk_nonexistent', aid)).toThrow('Task not found');
    });

    it('throws when agent not found', () => {
      const { tasks } = setupChainedTasks(db);
      expect(() => taskService.claim(db, tasks[0].id, 'ag_nonexistent')).toThrow('Agent not found');
    });
  });

  // --- release ---

  describe('release', () => {
    it('successfully releases a claimed task', () => {
      const { tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      taskService.claim(db, tasks[0].id, aid);
      taskService.release(db, tasks[0].id, aid);

      const task = taskService.get(db, tasks[0].id);
      expect(task?.assigned_agent_id).toBeNull();
      expect(task?.claimed_at).toBeNull();
    });

    it('updates agent status to online', () => {
      const { tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      taskService.claim(db, tasks[0].id, aid);
      taskService.release(db, tasks[0].id, aid);

      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(aid) as {
        status: string;
        current_task_id: string | null;
      };
      expect(agent.status).toBe('online');
      expect(agent.current_task_id).toBeNull();
    });

    it('throws when wrong agent tries to release', () => {
      const { tasks } = setupChainedTasks(db);
      const aid1 = createAgent(db, 'worker-1');
      const aid2 = createAgent(db, 'worker-2');

      taskService.claim(db, tasks[0].id, aid1);

      expect(() => taskService.release(db, tasks[0].id, aid2)).toThrow(
        `Task is claimed by agent '${aid1}', not '${aid2}'`,
      );
    });

    it('throws when task is not claimed', () => {
      const { tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      expect(() => taskService.release(db, tasks[0].id, aid)).toThrow('Task is not claimed');
    });

    it('throws when task not found', () => {
      const aid = createAgent(db);
      expect(() => taskService.release(db, 'tk_nonexistent', aid)).toThrow('Task not found');
    });

    it('throws when agent not found', () => {
      const { tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      taskService.claim(db, tasks[0].id, aid);

      // Delete the agent row to simulate inconsistent data
      db.prepare('PRAGMA foreign_keys = OFF').run();
      db.prepare('DELETE FROM agents WHERE id = ?').run(aid);
      db.prepare('PRAGMA foreign_keys = ON').run();

      expect(() => taskService.release(db, tasks[0].id, aid)).toThrow('Agent not found');
    });
  });

  // --- getAvailable ---

  describe('getAvailable', () => {
    it('returns pending unclaimed unblocked tasks', () => {
      const { workflowId, tasks } = setupChainedTasks(db);

      // Only Setup should be available (Build and Test are blocked)
      const available = taskService.getAvailable(db, { workflow_id: workflowId });
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe(tasks[0].id);
    });

    it('excludes blocked tasks', () => {
      const { workflowId, tasks } = setupChainedTasks(db);

      const available = taskService.getAvailable(db, { workflow_id: workflowId });
      const ids = available.map((t) => t.id);
      expect(ids).not.toContain(tasks[1].id);
      expect(ids).not.toContain(tasks[2].id);
    });

    it('includes tasks after deps are completed', () => {
      const { workflowId, tasks } = setupChainedTasks(db);

      // Complete Setup
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(tasks[0].id);

      const available = taskService.getAvailable(db, { workflow_id: workflowId });
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe(tasks[1].id);
    });

    it('excludes claimed tasks', () => {
      const { workflowId, tasks } = setupChainedTasks(db);
      const aid = createAgent(db);

      taskService.claim(db, tasks[0].id, aid);

      const available = taskService.getAvailable(db, { workflow_id: workflowId });
      expect(available).toHaveLength(0);
    });

    it('filters by workflow_id', () => {
      setupChainedTasks(db);

      const wf2 = workflowService.create(db, {
        name: 'Other Workflow',
        source_type: 'issue',
      });
      workflowService.setPlan(db, wf2.id, {
        summary: 'Plan',
        tasks: [{ name: 'Independent' }],
      });

      const available = taskService.getAvailable(db, { workflow_id: wf2.id });
      expect(available).toHaveLength(1);
      expect(available[0].name).toBe('Independent');
    });

    it('returns all available tasks across workflows when no filter', () => {
      setupChainedTasks(db);

      const wf2 = workflowService.create(db, {
        name: 'Other Workflow',
        source_type: 'issue',
      });
      workflowService.setPlan(db, wf2.id, {
        summary: 'Plan',
        tasks: [{ name: 'Independent' }],
      });

      const available = taskService.getAvailable(db);
      // Setup from wf1 + Independent from wf2
      expect(available).toHaveLength(2);
      const names = available.map((t) => t.name);
      expect(names).toContain('Setup');
      expect(names).toContain('Independent');
    });

    it('respects limit', () => {
      const wf = workflowService.create(db, {
        name: 'Workflow',
        source_type: 'issue',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      });

      const available = taskService.getAvailable(db, { workflow_id: wf.id, limit: 2 });
      expect(available).toHaveLength(2);
    });

    it('orders by sequence', () => {
      const wf = workflowService.create(db, {
        name: 'Workflow',
        source_type: 'issue',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'First' }, { name: 'Second' }, { name: 'Third' }],
      });

      const available = taskService.getAvailable(db, { workflow_id: wf.id });
      expect(available[0].name).toBe('First');
      expect(available[1].name).toBe('Second');
      expect(available[2].name).toBe('Third');
    });

    it('excludes non-pending tasks', () => {
      const { workflowId, tasks } = setupChainedTasks(db);
      db.prepare("UPDATE tasks SET status = 'planning' WHERE id = ?").run(tasks[0].id);

      const available = taskService.getAvailable(db, { workflow_id: workflowId });
      expect(available).toHaveLength(0);
    });
  });
});
