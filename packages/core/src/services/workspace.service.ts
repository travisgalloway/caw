import type { DatabaseType, SQLParam } from '../db/connection';
import type { Task } from '../types/task';
import type { Workflow } from '../types/workflow';
import type { Workspace, WorkspaceStatus } from '../types/workspace';
import { workspaceId } from '../utils/id';
import * as repositoryService from './repository.service';

// --- Parameter / Result types ---

export interface CreateParams {
  workflowId: string;
  path: string;
  branch: string;
  baseBranch?: string;
  taskIds?: string[];
  repositoryId?: string;
  repositoryPath?: string;
  config?: Record<string, unknown>;
}

export interface UpdateParams {
  status?: WorkspaceStatus;
  mergeCommit?: string;
  prUrl?: string;
  config?: Record<string, unknown>;
}

// --- Service functions ---

export function create(db: DatabaseType, params: CreateParams): Workspace {
  const run = db.transaction(() => {
    const workflow = db
      .prepare('SELECT id FROM workflows WHERE id = ?')
      .get(params.workflowId) as Pick<Workflow, 'id'> | null;

    if (!workflow) {
      throw new Error(`Workflow not found: ${params.workflowId}`);
    }

    let repoId = params.repositoryId ?? null;
    if (!repoId && params.repositoryPath) {
      const repo = repositoryService.register(db, { path: params.repositoryPath });
      repoId = repo.id;
    }

    // Auto-add repo to workflow_repositories if not already present
    if (repoId) {
      db.prepare(
        'INSERT OR IGNORE INTO workflow_repositories (workflow_id, repository_id, added_at) VALUES (?, ?, ?)',
      ).run(params.workflowId, repoId, Date.now());
    }

    const now = Date.now();

    const configJson = params.config ? JSON.stringify(params.config) : null;

    const workspace: Workspace = {
      id: workspaceId(),
      workflow_id: params.workflowId,
      repository_id: repoId,
      path: params.path,
      branch: params.branch,
      base_branch: params.baseBranch ?? null,
      status: 'active',
      merge_commit: null,
      pr_url: null,
      config: configJson,
      created_at: now,
      updated_at: now,
    };

    db.prepare(
      `INSERT INTO workspaces
        (id, workflow_id, repository_id, path, branch, base_branch, status, merge_commit, pr_url, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      workspace.id,
      workspace.workflow_id,
      workspace.repository_id,
      workspace.path,
      workspace.branch,
      workspace.base_branch,
      workspace.status,
      workspace.merge_commit,
      workspace.pr_url,
      workspace.config,
      workspace.created_at,
      workspace.updated_at,
    );

    if (params.taskIds && params.taskIds.length > 0) {
      const updateTask = db.prepare(
        'UPDATE tasks SET workspace_id = ?, updated_at = ? WHERE id = ?',
      );

      for (const taskId of params.taskIds) {
        const task = db
          .prepare('SELECT id, workflow_id FROM tasks WHERE id = ?')
          .get(taskId) as Pick<Task, 'id' | 'workflow_id'> | null;

        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }

        if (task.workflow_id !== params.workflowId) {
          throw new Error(`Task ${taskId} does not belong to workflow ${params.workflowId}`);
        }

        updateTask.run(workspace.id, now, taskId);
      }
    }

    return workspace;
  });

  return run();
}

export function get(db: DatabaseType, id: string): Workspace | null {
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Workspace | null;
  return row ?? null;
}

export function update(db: DatabaseType, id: string, params: UpdateParams): Workspace {
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Workspace | null;

  if (!workspace) {
    throw new Error(`Workspace not found: ${id}`);
  }

  if (params.status === 'merged' && !params.mergeCommit && !workspace.merge_commit) {
    throw new Error(`mergeCommit is required when setting status to 'merged'`);
  }

  const now = Date.now();
  const status = params.status ?? workspace.status;
  const mergeCommit = params.mergeCommit ?? workspace.merge_commit;
  const prUrl = params.prUrl ?? workspace.pr_url;

  let configJson = workspace.config;
  if (params.config) {
    const existing = workspace.config ? JSON.parse(workspace.config) : {};
    configJson = JSON.stringify({ ...existing, ...params.config });
  }

  db.prepare(
    'UPDATE workspaces SET status = ?, merge_commit = ?, pr_url = ?, config = ?, updated_at = ? WHERE id = ?',
  ).run(status, mergeCommit, prUrl, configJson, now, id);

  return {
    ...workspace,
    status,
    merge_commit: mergeCommit,
    pr_url: prUrl,
    config: configJson,
    updated_at: now,
  };
}

export function list(
  db: DatabaseType,
  workflowId: string,
  statusFilter?: WorkspaceStatus | WorkspaceStatus[],
  repositoryId?: string,
): Workspace[] {
  const conditions: string[] = ['workflow_id = ?'];
  const params: SQLParam[] = [workflowId];

  if (statusFilter) {
    const statuses = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
    conditions.push(`status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }

  if (repositoryId) {
    conditions.push('repository_id = ?');
    params.push(repositoryId);
  }

  const where = conditions.join(' AND ');

  return db
    .prepare(`SELECT * FROM workspaces WHERE ${where} ORDER BY created_at`)
    .all(...params) as Workspace[];
}

export function assignTask(db: DatabaseType, taskId: string, wsId: string): void {
  const task = db.prepare('SELECT id, workflow_id FROM tasks WHERE id = ?').get(taskId) as Pick<
    Task,
    'id' | 'workflow_id'
  > | null;

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const workspace = db
    .prepare('SELECT * FROM workspaces WHERE id = ?')
    .get(wsId) as Workspace | null;

  if (!workspace) {
    throw new Error(`Workspace not found: ${wsId}`);
  }

  if (workspace.status !== 'active') {
    throw new Error(`Cannot assign task to workspace with status '${workspace.status}'`);
  }

  if (task.workflow_id !== workspace.workflow_id) {
    throw new Error(
      `Task ${taskId} does not belong to workspace's workflow ${workspace.workflow_id}`,
    );
  }

  const now = Date.now();
  db.prepare('UPDATE tasks SET workspace_id = ?, updated_at = ? WHERE id = ?').run(
    wsId,
    now,
    taskId,
  );
}
