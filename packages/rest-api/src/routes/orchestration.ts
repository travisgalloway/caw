import type { DatabaseType } from '@caw/core';
import { orchestrationService } from '@caw/core';
import { getSearchParams, notFound, ok } from '../response';
import type { Router } from '../router';

export function registerOrchestrationRoutes(router: Router, db: DatabaseType) {
  // Get next tasks for a workflow
  router.get('/api/workflows/:id/next-tasks', (req, params) => {
    const sp = getSearchParams(req);
    const includeFailed = sp.get('include_failed') === 'true';
    const includePaused = sp.get('include_paused') === 'true';

    try {
      const result = orchestrationService.getNextTasks(db, params.id, includeFailed, includePaused);
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      throw err;
    }
  });

  // Get workflow progress
  router.get('/api/workflows/:id/progress', (_, params) => {
    try {
      const result = orchestrationService.getProgress(db, params.id);
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      throw err;
    }
  });

  // Check task dependencies
  router.get('/api/tasks/:id/check-dependencies', (_, params) => {
    try {
      const result = orchestrationService.checkDependencies(db, params.id);
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      throw err;
    }
  });
}
