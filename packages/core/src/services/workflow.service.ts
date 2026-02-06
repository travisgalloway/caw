import type { DatabaseType, SQLParam } from '../db/connection';
import type { Repository } from '../types/repository';
import type { Task } from '../types/task';
import type { Workflow, WorkflowStatus, WorkflowSummary } from '../types/workflow';
import type { WorkflowRepository } from '../types/workflow-repository';
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
  repository_paths?: string[];
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
  repository_path?: string;
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

export interface WorkflowRepositoryInfo extends Repository {
  added_at: number;
}

// --- Service functions ---

export function create(db: DatabaseType, params: CreateParams): Workflow {
  const now = Date.now();
  const configJson = params.config ? JSON.stringify(params.config) : null;

  const workflow: Workflow = {
    id: workflowId(),
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
    locked_by_session_id: null,
    locked_at: null,
  };

  db.prepare(
    `INSERT INTO workflows
      (id, name, source_type, source_ref, source_content, status,
       initial_plan, plan_summary, created_at, updated_at, max_parallel_tasks,
       auto_create_workspaces, config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    workflow.id,
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

  if (params.repository_paths && params.repository_paths.length > 0) {
    const insertWR = db.prepare(
      'INSERT INTO workflow_repositories (workflow_id, repository_id, added_at) VALUES (?, ?, ?)',
    );
    for (const path of params.repository_paths) {
      const repo = repositoryService.register(db, { path });
      insertWR.run(workflow.id, repo.id, now);
    }
  }

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
    conditions.push(
      'id IN (SELECT workflow_id FROM workflow_repositories WHERE repository_id = ?)',
    );
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
        (id, workflow_id, name, description, status, sequence, parallel_group, repository_id, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertWR = db.prepare(
      'INSERT OR IGNORE INTO workflow_repositories (workflow_id, repository_id, added_at) VALUES (?, ?, ?)',
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

      let repoId: string | null = null;
      if (t.repository_path) {
        const repo = repositoryService.register(db, { path: t.repository_path });
        repoId = repo.id;
        insertWR.run(id, repo.id, now);
      }

      insertTask.run(
        tId,
        id,
        t.name,
        t.description ?? null,
        'pending',
        i + 1,
        t.parallel_group ?? null,
        repoId,
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

  const repos = listRepositories(db, id);

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
      repositories: repos.map((r) => ({ id: r.id, path: r.path })),
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

    if (repos.length > 0) {
      lines.push('## Repositories', '');
      for (const r of repos) {
        lines.push(`- ${r.path}`);
      }
      lines.push('');
    }

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

// --- Multi-repo management ---

export function addRepository(
  db: DatabaseType,
  workflowId: string,
  params: { path: string },
): WorkflowRepository {
  const workflow = db.prepare('SELECT id FROM workflows WHERE id = ?').get(workflowId) as Pick<
    Workflow,
    'id'
  > | null;

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const repo = repositoryService.register(db, { path: params.path });
  const now = Date.now();

  const existing = db
    .prepare(
      'SELECT workflow_id, repository_id FROM workflow_repositories WHERE workflow_id = ? AND repository_id = ?',
    )
    .get(workflowId, repo.id) as WorkflowRepository | null;

  if (existing) {
    return existing;
  }

  db.prepare(
    'INSERT INTO workflow_repositories (workflow_id, repository_id, added_at) VALUES (?, ?, ?)',
  ).run(workflowId, repo.id, now);

  return { workflow_id: workflowId, repository_id: repo.id, added_at: now };
}

export function removeRepository(db: DatabaseType, workflowId: string, repositoryId: string): void {
  const workflow = db.prepare('SELECT id FROM workflows WHERE id = ?').get(workflowId) as Pick<
    Workflow,
    'id'
  > | null;

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Validate no tasks/workspaces still reference this repo
  const taskRef = db
    .prepare('SELECT id FROM tasks WHERE workflow_id = ? AND repository_id = ? LIMIT 1')
    .get(workflowId, repositoryId) as { id: string } | null;

  if (taskRef) {
    throw new Error(`Cannot remove repository: task ${taskRef.id} still references it`);
  }

  const wsRef = db
    .prepare('SELECT id FROM workspaces WHERE workflow_id = ? AND repository_id = ? LIMIT 1')
    .get(workflowId, repositoryId) as { id: string } | null;

  if (wsRef) {
    throw new Error(`Cannot remove repository: workspace ${wsRef.id} still references it`);
  }

  db.prepare('DELETE FROM workflow_repositories WHERE workflow_id = ? AND repository_id = ?').run(
    workflowId,
    repositoryId,
  );
}

export function listRepositories(db: DatabaseType, workflowId: string): WorkflowRepositoryInfo[] {
  return db
    .prepare(
      `SELECT r.*, wr.added_at
       FROM workflow_repositories wr
       JOIN repositories r ON r.id = wr.repository_id
       WHERE wr.workflow_id = ?
       ORDER BY wr.added_at`,
    )
    .all(workflowId) as WorkflowRepositoryInfo[];
}
