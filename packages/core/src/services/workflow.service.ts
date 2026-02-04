import type { DatabaseType, SQLParam } from '../db/connection';
import type { Task } from '../types/task';
import type { Workflow, WorkflowStatus, WorkflowSummary } from '../types/workflow';
import { taskId, workflowId } from '../utils/id';
import { estimateTokens } from '../utils/tokens';
import * as repositoryService from './repository.service';
import { isValidWorkflowTransition } from './transitions';

// --- Parameter / Result types ---

export interface CreateParams {
  name: string;
  source_type: string;
  source_ref?: string;
  source_content?: string;
  repository_id?: string;
  repository_path?: string;
  max_parallel_tasks?: number;
  auto_create_workspaces?: boolean;
  config?: Record<string, unknown>;
}

export interface GetOptions {
  includeTasks?: boolean;
}

export interface WorkflowWithTasks extends Workflow {
  tasks: Task[];
}

export interface ListFilters {
  repository_id?: string;
  status?: WorkflowStatus | WorkflowStatus[];
  limit?: number;
  offset?: number;
}

export interface PlanTask {
  name: string;
  description?: string;
  parallel_group?: string;
  estimated_complexity?: string;
  files_likely_affected?: string[];
  depends_on?: string[];
}

export interface SetPlanParams {
  summary: string;
  tasks: PlanTask[];
}

export interface SetPlanResult {
  workflow_id: string;
  tasks_created: number;
  parallelizable_groups: string[];
  status: 'ready';
}

// --- Service functions ---

export function create(db: DatabaseType, params: CreateParams): Workflow {
  let repoId = params.repository_id ?? null;

  if (!repoId && params.repository_path) {
    const repo = repositoryService.register(db, { path: params.repository_path });
    repoId = repo.id;
  }

  const now = Date.now();
  const configJson = params.config ? JSON.stringify(params.config) : null;

  const workflow: Workflow = {
    id: workflowId(),
    repository_id: repoId,
    name: params.name,
    source_type: params.source_type,
    source_ref: params.source_ref ?? null,
    source_content: params.source_content ?? null,
    status: 'planning',
    initial_plan: null,
    plan_summary: null,
    created_at: now,
    updated_at: now,
    max_parallel_tasks: params.max_parallel_tasks ?? 1,
    auto_create_workspaces: params.auto_create_workspaces ? 1 : 0,
    config: configJson,
  };

  db.prepare(
    `INSERT INTO workflows
      (id, repository_id, name, source_type, source_ref, source_content, status,
       initial_plan, plan_summary, created_at, updated_at, max_parallel_tasks,
       auto_create_workspaces, config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    workflow.id,
    workflow.repository_id,
    workflow.name,
    workflow.source_type,
    workflow.source_ref,
    workflow.source_content,
    workflow.status,
    workflow.initial_plan,
    workflow.plan_summary,
    workflow.created_at,
    workflow.updated_at,
    workflow.max_parallel_tasks,
    workflow.auto_create_workspaces,
    workflow.config,
  );

  return workflow;
}

export function get(db: DatabaseType, id: string, options?: GetOptions): WorkflowWithTasks | null {
  const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Workflow | null;

  if (!row) {
    return null;
  }

  const tasks: Task[] = options?.includeTasks
    ? (db
        .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence, name')
        .all(id) as Task[])
    : [];

  return { ...row, tasks };
}

export function list(
  db: DatabaseType,
  filters?: ListFilters,
): { workflows: WorkflowSummary[]; total: number } {
  const conditions: string[] = [];
  const params: SQLParam[] = [];
  const limit = filters?.limit ?? 20;
  const offset = filters?.offset ?? 0;

  if (filters?.repository_id) {
    conditions.push('repository_id = ?');
    params.push(filters.repository_id);
  }

  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    conditions.push(`status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { total } = db
    .prepare(`SELECT COUNT(*) as total FROM workflows ${where}`)
    .get(...params) as {
    total: number;
  };

  const workflows = db
    .prepare(
      `SELECT id, name, status, created_at, updated_at FROM workflows ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as WorkflowSummary[];

  return { workflows, total };
}

export function setPlan(db: DatabaseType, id: string, plan: SetPlanParams): SetPlanResult {
  const run = db.transaction(() => {
    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Workflow | null;

    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }

    if (workflow.status !== 'planning') {
      throw new Error(
        `Cannot set plan: workflow status is '${workflow.status}', expected 'planning'`,
      );
    }

    const now = Date.now();
    const planJson = JSON.stringify(plan);

    db.prepare(
      'UPDATE workflows SET initial_plan = ?, plan_summary = ?, status = ?, updated_at = ? WHERE id = ?',
    ).run(planJson, plan.summary, 'ready', now, id);

    // Validate: no duplicate task names
    const seenNames = new Set<string>();
    for (const t of plan.tasks) {
      if (seenNames.has(t.name)) {
        throw new Error(`Duplicate task name '${t.name}' in plan`);
      }
      seenNames.add(t.name);
    }

    // First pass: insert all tasks, build name→id map
    const nameToIdMap = new Map<string, string>();
    const parallelGroups = new Set<string>();

    const insertTask = db.prepare(
      `INSERT INTO tasks
        (id, workflow_id, name, description, status, sequence, parallel_group, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (let i = 0; i < plan.tasks.length; i++) {
      const t = plan.tasks[i];
      const tId = taskId();
      nameToIdMap.set(t.name, tId);

      if (t.parallel_group) {
        parallelGroups.add(t.parallel_group);
      }

      const context: Record<string, unknown> = {};
      if (t.estimated_complexity) context.estimated_complexity = t.estimated_complexity;
      if (t.files_likely_affected) context.files_likely_affected = t.files_likely_affected;
      const contextJson = Object.keys(context).length > 0 ? JSON.stringify(context) : null;

      insertTask.run(
        tId,
        id,
        t.name,
        t.description ?? null,
        'pending',
        i + 1,
        t.parallel_group ?? null,
        contextJson,
        now,
        now,
      );
    }

    // Second pass: insert task dependencies
    const insertDep = db.prepare(
      'INSERT INTO task_dependencies (task_id, depends_on_id, dependency_type) VALUES (?, ?, ?)',
    );

    for (const t of plan.tasks) {
      if (!t.depends_on || t.depends_on.length === 0) continue;

      const tId = nameToIdMap.get(t.name) as string;
      for (const depName of t.depends_on) {
        if (depName === t.name) {
          throw new Error(`Task '${t.name}' cannot depend on itself`);
        }
        const depId = nameToIdMap.get(depName);
        if (!depId) {
          throw new Error(`Unknown dependency '${depName}' in task '${t.name}'`);
        }
        insertDep.run(tId, depId, 'blocks');
      }
    }

    return {
      workflow_id: id,
      tasks_created: plan.tasks.length,
      parallelizable_groups: [...parallelGroups],
      status: 'ready' as const,
    };
  });

  return run();
}

export function updateStatus(
  db: DatabaseType,
  id: string,
  status: WorkflowStatus,
  reason?: string,
): Workflow {
  const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Workflow | null;

  if (!workflow) {
    throw new Error(`Workflow not found: ${id}`);
  }

  if (!isValidWorkflowTransition(workflow.status, status)) {
    throw new Error(`Invalid transition from '${workflow.status}' to '${status}'`);
  }

  const now = Date.now();
  let config = workflow.config ? JSON.parse(workflow.config) : {};

  if (reason) {
    config = { ...config, last_status_reason: reason };
  }

  const configJson = Object.keys(config).length > 0 ? JSON.stringify(config) : workflow.config;

  db.prepare('UPDATE workflows SET status = ?, updated_at = ?, config = ? WHERE id = ?').run(
    status,
    now,
    configJson,
    id,
  );

  return { ...workflow, status, updated_at: now, config: configJson };
}

export function setParallelism(
  db: DatabaseType,
  id: string,
  maxParallel: number,
  autoCreateWorkspaces?: boolean,
): Workflow {
  const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Workflow | null;

  if (!workflow) {
    throw new Error(`Workflow not found: ${id}`);
  }

  const now = Date.now();
  const updates: string[] = ['max_parallel_tasks = ?', 'updated_at = ?'];
  const params: SQLParam[] = [maxParallel, now];

  if (autoCreateWorkspaces !== undefined) {
    updates.push('auto_create_workspaces = ?');
    params.push(autoCreateWorkspaces ? 1 : 0);
  }

  params.push(id);
  db.prepare(`UPDATE workflows SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return {
    ...workflow,
    max_parallel_tasks: maxParallel,
    auto_create_workspaces:
      autoCreateWorkspaces !== undefined
        ? autoCreateWorkspaces
          ? 1
          : 0
        : workflow.auto_create_workspaces,
    updated_at: now,
  };
}

export function getSummary(
  db: DatabaseType,
  id: string,
  format: 'json' | 'markdown',
): { summary: string; token_estimate: number } {
  const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Workflow | null;

  if (!workflow) {
    throw new Error(`Workflow not found: ${id}`);
  }

  const tasks = db
    .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence, name')
    .all(id) as Task[];

  const taskCountsByStatus: Record<string, number> = {};
  for (const t of tasks) {
    taskCountsByStatus[t.status] = (taskCountsByStatus[t.status] ?? 0) + 1;
  }

  let summary: string;

  if (format === 'json') {
    const obj = {
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      plan_summary: workflow.plan_summary,
      total_tasks: tasks.length,
      tasks_by_status: taskCountsByStatus,
    };
    summary = JSON.stringify(obj, null, 2);
  } else {
    const lines: string[] = [
      `# ${workflow.name}`,
      '',
      `**Status:** ${workflow.status}`,
      `**Tasks:** ${tasks.length} total`,
      '',
    ];

    if (workflow.plan_summary) {
      lines.push(`## Plan`, '', workflow.plan_summary, '');
    }

    if (Object.keys(taskCountsByStatus).length > 0) {
      lines.push('## Tasks by Status', '');
      for (const [status, count] of Object.entries(taskCountsByStatus)) {
        lines.push(`- ${status}: ${count}`);
      }
      lines.push('');
    }

    summary = lines.join('\n');
  }

  return {
    summary,
    token_estimate: estimateTokens(summary),
  };
}
