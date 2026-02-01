import type { DatabaseType } from '../connection';
import { sql as initialSql } from './001_initial';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  { version: 1, name: '001_initial', sql: initialSql },
];

export function ensureMigrationsTable(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
}

export function getAppliedVersions(db: DatabaseType): number[] {
  ensureMigrationsTable(db);
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[];
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
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        Date.now(),
      );
    });

    run();
  }
}
