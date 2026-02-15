import type { DatabaseType } from '@caw/core';
import { lockService } from '@caw/core';
import { badRequest, notFound, ok, parseBody } from '../response';
import type { Router } from '../router';

export function registerLockRoutes(router: Router, db: DatabaseType) {
  // Get lock info
  router.get('/api/workflows/:id/lock', (_, params) => {
    try {
      const info = lockService.getLockInfo(db, params.id);
      return ok(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      throw err;
    }
  });

  // Lock workflow
  router.post('/api/workflows/:id/lock', async (req, params) => {
    const body = await parseBody<{ session_id: string }>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.session_id) return badRequest('session_id is required');

    try {
      const result = lockService.lock(db, params.id, body.session_id);
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Unlock workflow
  router.post('/api/workflows/:id/unlock', async (req, params) => {
    const body = await parseBody<{ session_id: string }>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.session_id) return badRequest('session_id is required');

    try {
      const result = lockService.unlock(db, params.id, body.session_id);
      return ok({ success: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });
}
