import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations } from '@caw/core';

export function createTestDb(): DatabaseType {
  const db = createConnection(':memory:');
  runMigrations(db);
  return db;
}

export async function apiRequest(
  handle: (req: Request) => Response | Promise<Response>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: () => Promise<unknown> }> {
  const url = `http://localhost${path}`;
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const req = new Request(url, init);
  const res = await handle(req);
  return {
    status: res.status,
    json: () => res.json(),
  };
}
