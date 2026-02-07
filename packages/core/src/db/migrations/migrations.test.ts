import { describe, expect, it } from 'bun:test';
import { createConnection } from '../connection';
import { getAppliedVersions, runMigrations } from './index';

function getTables(db: ReturnType<typeof createConnection>): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function getIndexes(db: ReturnType<typeof createConnection>): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe('runMigrations', () => {
  it('creates all tables on fresh database', () => {
    const db = createConnection(':memory:');
    runMigrations(db);

    const tables = getTables(db);
    expect(tables).toContain('schema_migrations');
    expect(tables).toContain('repositories');
    expect(tables).toContain('workflows');
    expect(tables).toContain('tasks');
    expect(tables).toContain('task_dependencies');
    expect(tables).toContain('checkpoints');
    expect(tables).toContain('workspaces');
    expect(tables).toContain('workflow_templates');
    expect(tables).toContain('agents');
    expect(tables).toContain('messages');
    expect(tables).toContain('sessions');
    expect(tables).toContain('workflow_repositories');
    expect(tables).toHaveLength(12);

    db.close();
  });

  it('creates all indexes', () => {
    const db = createConnection(':memory:');
    runMigrations(db);

    const indexes = getIndexes(db);
    expect(indexes).toHaveLength(19);
    expect(indexes).toContain('idx_workflow_repositories_repo');
    expect(indexes).toContain('idx_workflows_status');
    expect(indexes).toContain('idx_workflows_locked_by');
    expect(indexes).toContain('idx_tasks_workflow');
    expect(indexes).toContain('idx_tasks_status');
    expect(indexes).toContain('idx_tasks_parallel');
    expect(indexes).toContain('idx_tasks_agent');
    expect(indexes).toContain('idx_checkpoints_task');
    expect(indexes).toContain('idx_workspaces_workflow');
    expect(indexes).toContain('idx_workspaces_status');
    expect(indexes).toContain('idx_agents_status');
    expect(indexes).toContain('idx_agents_role');
    expect(indexes).toContain('idx_agents_workflow_id');
    expect(indexes).toContain('idx_messages_recipient');
    expect(indexes).toContain('idx_messages_thread');
    expect(indexes).toContain('idx_messages_workflow');
    expect(indexes).toContain('idx_sessions_heartbeat');
    expect(indexes).toContain('idx_tasks_repository');
    expect(indexes).toContain('idx_workspaces_repository');

    db.close();
  });

  it('records version 1 in schema_migrations', () => {
    const db = createConnection(':memory:');
    runMigrations(db);

    const versions = getAppliedVersions(db);
    expect(versions).toEqual([1, 2, 3, 4]);

    db.close();
  });

  it('is idempotent — second run is a no-op', () => {
    const db = createConnection(':memory:');
    runMigrations(db);
    runMigrations(db);

    const tables = getTables(db);
    expect(tables).toHaveLength(12);

    const versions = getAppliedVersions(db);
    expect(versions).toEqual([1, 2, 3, 4]);

    db.close();
  });
});
