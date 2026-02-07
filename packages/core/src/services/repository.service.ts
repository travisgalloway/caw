import type { DatabaseType } from '../db/connection';
import type { Repository } from '../types/repository';
import type { WorkflowSummary } from '../types/workflow';
import { repositoryId } from '../utils/id';

export function register(db: DatabaseType, params: { path: string; name?: string }): Repository {
  const existing = db
    .prepare('SELECT * FROM repositories WHERE path = ?')
    .get(params.path) as Repository | null;

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const repo: Repository = {
    id: repositoryId(),
    path: params.path,
    name: params.name ?? null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    'INSERT INTO repositories (id, path, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(repo.id, repo.path, repo.name, repo.created_at, repo.updated_at);

  return repo;
}

export function list(
  db: DatabaseType,
  params?: { limit?: number; offset?: number },
): { repositories: Repository[]; total: number } {
  const limit = params?.limit ?? 20;
  const offset = params?.offset ?? 0;

  const { total } = db.prepare('SELECT COUNT(*) as total FROM repositories').get() as {
    total: number;
  };

  const repositories = db
    .prepare('SELECT * FROM repositories ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as Repository[];

  return { repositories, total };
}

export function getByPath(db: DatabaseType, path: string): Repository | null {
  const row = db
    .prepare('SELECT * FROM repositories WHERE path = ?')
    .get(path) as Repository | null;
  return row ?? null;
}

export function getWorkflows(db: DatabaseType, repoId: string): WorkflowSummary[] {
  return db
    .prepare(
      `SELECT w.id, w.name, w.status, w.source_type, w.created_at, w.updated_at
       FROM workflows w
       JOIN workflow_repositories wr ON wr.workflow_id = w.id
       WHERE wr.repository_id = ?
       ORDER BY w.created_at DESC`,
    )
    .all(repoId) as WorkflowSummary[];
}
