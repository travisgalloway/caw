import type { DatabaseType } from '@caw/core';
import { checkpointService } from '@caw/core';
import { badRequest, created, getSearchParams, notFound, ok, parseBody } from '../response';
import type { Router } from '../router';

export function registerCheckpointRoutes(router: Router, db: DatabaseType) {
  // List checkpoints for a task
  router.get('/api/tasks/:id/checkpoints', (req, params) => {
    const sp = getSearchParams(req);
    const limit = sp.get('limit');

    const checkpoints = checkpointService.list(db, params.id, {
      limit: limit ? Number(limit) : undefined,
    });
    return ok(checkpoints);
  });

  // Add checkpoint
  router.post('/api/tasks/:id/checkpoints', async (req, params) => {
    const body = await parseBody<{
      type: string;
      summary: string;
      detail?: Record<string, unknown>;
      files_changed?: string[];
    }>(req);

    if (!body) return badRequest('Invalid JSON body');
    if (!body.type) return badRequest('type is required');
    if (!body.summary) return badRequest('summary is required');

    try {
      const result = checkpointService.add(db, params.id, {
        type: body.type as Parameters<typeof checkpointService.add>[2]['type'],
        summary: body.summary,
        detail: body.detail,
        filesChanged: body.files_changed,
      });
      return created(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });
}
