import type { DatabaseType } from '@caw/core';
import { repositoryService } from '@caw/core';
import { badRequest, created, getSearchParams, notFound, ok, parseBody } from '../response';
import type { Router } from '../router';

export function registerRepositoryRoutes(router: Router, db: DatabaseType) {
  // List repositories
  router.get('/api/repositories', (req) => {
    const sp = getSearchParams(req);
    const limit = sp.get('limit') ? Number(sp.get('limit')) : undefined;
    const offset = sp.get('offset') ? Number(sp.get('offset')) : undefined;

    const result = repositoryService.list(db, { limit, offset });
    return ok(result.repositories, { total: result.total });
  });

  // Get repository by ID
  router.get('/api/repositories/:id', (_, params) => {
    // repositoryService doesn't have getById, query directly
    const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(params.id) as Record<
      string,
      unknown
    > | null;

    if (!repo) return notFound(`Repository not found: ${params.id}`);
    return ok(repo);
  });

  // Register repository
  router.post('/api/repositories', async (req) => {
    const body = await parseBody<{ name?: string; path: string }>(req);
    if (!body?.path) {
      return badRequest('path is required');
    }

    const repo = repositoryService.register(db, {
      path: body.path,
      name: body.name,
    });

    return created(repo);
  });
}
