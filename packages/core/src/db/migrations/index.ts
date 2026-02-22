import type { DatabaseType } from '../connection';
import { sql as initialSql } from './001_initial';
import { sql as sessionsSql } from './002_sessions';
import { sql as workflowLocksSql } from './003_workflow_locks';
import { sql as agentWorkflowIdSql } from './004_agent_workflow_id';
import { sql as workspacePrUrlSql } from './005_workspace_pr_url';
import { sql as workspaceConfigSql } from './006_workspace_config';
import { sql as taskContextFromSql } from './007_task_context_from';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  { version: 1, name: '001_initial', sql: initialSql },
  { version: 2, name: '002_sessions', sql: sessionsSql },
  { version: 3, name: '003_workflow_locks', sql: workflowLocksSql },
  { version: 4, name: '004_agent_workflow_id', sql: agentWorkflowIdSql },
  { version: 5, name: '005_workspace_pr_url', sql: workspacePrUrlSql },
  { version: 6, name: '006_workspace_config', sql: workspaceConfigSql },
  { version: 7, name: '007_task_context_from', sql: taskContextFromSql },
];

export function ensureMigrationsTable(db: DatabaseType): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
}

export function getAppliedVersions(db: DatabaseType): number[] {
  ensureMigrationsTable(db);
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
    version: number;
  }[];
  return rows.map((r) => r.version);
}

export function runMigrations(db: DatabaseType): void {
  ensureMigrationsTable(db);
  const applied = new Set(getAppliedVersions(db));

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }

    const run = db.transaction(() => {
      db.run(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        Date.now(),
      );
    });

    run();
  }
}
