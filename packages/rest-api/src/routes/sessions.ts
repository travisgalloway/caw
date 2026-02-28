import type { DatabaseType } from '@caw/core';
import { sessionService } from '@caw/core';
import { badRequest, created, ok, parseBody } from '../response';
import type { Router } from '../router';

export function registerSessionRoutes(router: Router, db: DatabaseType) {
  // Register a new session (e.g., browser session for lock operations)
  router.post('/api/sessions', async (req) => {
    const body = await parseBody<{
      metadata?: Record<string, unknown>;
    }>(req);

    const session = sessionService.register(db, {
      pid: process.pid,
      is_daemon: false,
      metadata: body?.metadata ?? { source: 'web-ui' },
    });

    return created(session);
  });

  // List sessions
  router.get('/api/sessions', () => {
    const sessions = sessionService.list(db);
    return ok(sessions);
  });
}
