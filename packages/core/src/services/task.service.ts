import type { DatabaseType, SQLParam } from '../db/connection';
import type { Checkpoint } from '../types/checkpoint';
import type { Task, TaskDependency, TaskStatus } from '../types/task';
import * as checkpointService from './checkpoint.service';
import { isValidTaskTransition } from './transitions';

// --- Parameter / Result types ---

export interface GetOptions {
  includeCheckpoints?: boolean;
  checkpointLimit?: number;
}

export interface TaskWithCheckpoints extends Task {
  checkpoints: Checkpoint[];
}

export interface UpdateStatusParams {
  outcome?: string;
  error?: string;
}

export interface SetPlanParams {
  plan: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface ReplanResult {
  task: Task;
  checkpoint_id: string;
}

export interface ClaimResult {
  success: boolean;
  already_claimed_by?: string;
}

export interface Dependencies {
  dependencies: TaskDependency[];
  dependents: TaskDependency[];
}

export interface GetAvailableFilters {
  workflow_id?: string;
  limit?: number;
}

// --- Service functions ---

export function get(
  db: DatabaseType,
  id: string,
  options?: GetOptions,
): TaskWithCheckpoints | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | null;

  if (!row) {
    return null;
  }

  const checkpoints: Checkpoint[] = options?.includeCheckpoints
    ? checkpointService.list(db, id, {
        limit: options.checkpointLimit,
      })
    : [];

  return { ...row, checkpoints };
}

export function isBlocked(db: DatabaseType, id: string): boolean {
  const { count } = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.depends_on_id
       WHERE td.task_id = ?
         AND td.dependency_type = 'blocks'
         AND t.status NOT IN ('completed', 'skipped')`,
    )
    .get(id) as { count: number };

  return count > 0;
}

export function getDependencies(db: DatabaseType, id: string): Dependencies {
  const dependencies = db
    .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
    .all(id) as TaskDependency[];

  const dependents = db
    .prepare('SELECT * FROM task_dependencies WHERE depends_on_id = ?')
    .all(id) as TaskDependency[];

  return { dependencies, dependents };
}

export function updateStatus(
  db: DatabaseType,
  id: string,
  status: TaskStatus,
  params?: UpdateStatusParams,
): Task {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | null;

  if (!task) {
    throw new Error(`Task not found: ${id}`);
  }

  if (!isValidTaskTransition(task.status, status)) {
    throw new Error(`Invalid transition from '${task.status}' to '${status}'`);
  }

  if ((task.status === 'pending' || task.status === 'blocked') && status === 'planning') {
    if (isBlocked(db, id)) {
      throw new Error(`Cannot transition to 'planning': task has incomplete blocking dependencies`);
    }
  }

  if (status === 'completed' && !params?.outcome) {
    throw new Error(`Outcome is required when completing a task`);
  }

  if (status === 'failed' && !params?.error) {
    throw new Error(`Error is required when failing a task`);
  }

  const now = Date.now();
  const outcome = status === 'completed' ? (params?.outcome ?? null) : task.outcome;
  const outcomeDetail = status === 'failed' ? (params?.error ?? null) : task.outcome_detail;

  db.prepare(
    'UPDATE tasks SET status = ?, outcome = ?, outcome_detail = ?, updated_at = ? WHERE id = ?',
  ).run(status, outcome, outcomeDetail, now, id);

  return { ...task, status, outcome, outcome_detail: outcomeDetail, updated_at: now };
}

export function setPlan(db: DatabaseType, id: string, params: SetPlanParams): Task {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | null;

  if (!task) {
    throw new Error(`Task not found: ${id}`);
  }

  if (task.status !== 'planning') {
    throw new Error(`Cannot set plan: task status is '${task.status}', expected 'planning'`);
  }

  const now = Date.now();
  const planJson = JSON.stringify(params.plan);

  let contextJson = task.context;
  if (params.context) {
    const existing = task.context ? JSON.parse(task.context) : {};
    contextJson = JSON.stringify({ ...existing, ...params.context });
  }

  db.prepare('UPDATE tasks SET plan = ?, context = ?, updated_at = ? WHERE id = ?').run(
    planJson,
    contextJson,
    now,
    id,
  );

  return { ...task, plan: planJson, context: contextJson, updated_at: now };
}

export function replan(
  db: DatabaseType,
  id: string,
  reason: string,
  newPlan: Record<string, unknown>,
): ReplanResult {
  const run = db.transaction(() => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | null;

    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    if (task.status !== 'failed' && task.status !== 'in_progress') {
      throw new Error(
        `Cannot replan: task status is '${task.status}', expected 'failed' or 'in_progress'`,
      );
    }

    const checkpoint = checkpointService.add(db, id, {
      type: 'replan',
      summary: reason,
    });

    const now = Date.now();
    const planJson = JSON.stringify(newPlan);

    db.prepare(
      'UPDATE tasks SET plan = ?, status = ?, outcome = NULL, outcome_detail = NULL, updated_at = ? WHERE id = ?',
    ).run(planJson, 'pending', now, id);

    const updated: Task = {
      ...task,
      plan: planJson,
      status: 'pending',
      outcome: null,
      outcome_detail: null,
      updated_at: now,
    };

    return { task: updated, checkpoint_id: checkpoint.id };
  });

  return run();
}

export function claim(db: DatabaseType, taskId: string, agentId: string): ClaimResult {
  const run = db.transaction(() => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | null;

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const terminalStatuses: TaskStatus[] = ['completed', 'skipped'];
    if (terminalStatuses.includes(task.status)) {
      throw new Error(`Cannot claim task in '${task.status}' status`);
    }

    if (task.assigned_agent_id) {
      if (task.assigned_agent_id === agentId) {
        return { success: true };
      }
      return { success: false, already_claimed_by: task.assigned_agent_id };
    }

    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const now = Date.now();

    db.prepare(
      'UPDATE tasks SET assigned_agent_id = ?, claimed_at = ?, updated_at = ? WHERE id = ?',
    ).run(agentId, now, now, taskId);

    db.prepare(
      'UPDATE agents SET current_task_id = ?, status = ?, updated_at = ? WHERE id = ?',
    ).run(taskId, 'busy', now, agentId);

    return { success: true };
  });

  return run();
}

export function release(db: DatabaseType, taskId: string, agentId: string, _reason?: string): void {
  const run = db.transaction(() => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | null;

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.assigned_agent_id) {
      throw new Error(`Task is not claimed`);
    }

    if (task.assigned_agent_id !== agentId) {
      throw new Error(`Task is claimed by agent '${task.assigned_agent_id}', not '${agentId}'`);
    }

    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const now = Date.now();

    db.prepare(
      'UPDATE tasks SET assigned_agent_id = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?',
    ).run(now, taskId);

    db.prepare(
      'UPDATE agents SET current_task_id = NULL, status = ?, updated_at = ? WHERE id = ?',
    ).run('online', now, agentId);
  });

  run();
}

export function getAvailable(db: DatabaseType, filters?: GetAvailableFilters): Task[] {
  const conditions: string[] = [
    "t.status = 'pending'",
    't.assigned_agent_id IS NULL',
    `NOT EXISTS (
      SELECT 1 FROM task_dependencies td
      JOIN tasks dep ON dep.id = td.depends_on_id
      WHERE td.task_id = t.id
        AND td.dependency_type = 'blocks'
        AND dep.status NOT IN ('completed', 'skipped')
    )`,
  ];
  const params: SQLParam[] = [];

  if (filters?.workflow_id) {
    conditions.push('t.workflow_id = ?');
    params.push(filters.workflow_id);
  }

  const where = conditions.join(' AND ');
  let sql = `SELECT t.* FROM tasks t WHERE ${where} ORDER BY t.sequence ASC`;

  if (filters?.limit != null) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  return db.prepare(sql).all(...params) as Task[];
}
