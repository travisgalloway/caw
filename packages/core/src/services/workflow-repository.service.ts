import type { DatabaseType } from '../db/connection';
import type { Repository } from '../types/repository';
import type { Workflow } from '../types/workflow';
import type { WorkflowRepository } from '../types/workflow-repository';
import * as repositoryService from './repository.service';

export interface WorkflowRepositoryInfo extends Repository {
  added_at: number;
}

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
      'SELECT workflow_id, repository_id, added_at FROM workflow_repositories WHERE workflow_id = ? AND repository_id = ?',
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
