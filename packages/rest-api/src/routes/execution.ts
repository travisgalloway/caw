import type { DatabaseType } from '@caw/core';
import { badRequest, notFound, ok, parseBody, serverError } from '../response';
import type { Router } from '../router';
import type { Broadcaster } from '../ws/broadcaster';

/**
 * Spawner interface — injected by the host (TUI app) to avoid
 * a direct dependency on @caw/spawner in the rest-api package.
 */
export interface SpawnerProvider {
  start(workflowId: string, options?: Record<string, unknown>): Promise<void>;
  suspend(workflowId: string): Promise<void>;
  resume(workflowId: string): Promise<void>;
  getStatus(workflowId: string): { running: boolean; agentCount: number } | null;
}

export function registerExecutionRoutes(
  router: Router,
  db: DatabaseType,
  broadcaster?: Broadcaster,
  spawner?: SpawnerProvider,
) {
  // Start workflow execution
  router.post('/api/workflows/:id/execute', async (_, params) => {
    if (!spawner) {
      return serverError('Execution engine not available');
    }

    const workflowId = params.id;

    // Verify workflow exists
    const workflow = db
      .prepare('SELECT id, status FROM workflows WHERE id = ?')
      .get(workflowId) as { id: string; status: string } | null;

    if (!workflow) return notFound(`Workflow not found: ${workflowId}`);

    try {
      await spawner.start(workflowId);
      broadcaster?.emit('workflow:status', { id: workflowId, status: 'in_progress' });
      return ok({ id: workflowId, action: 'started' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return badRequest(`Failed to start execution: ${msg}`);
    }
  });

  // Suspend workflow execution
  router.post('/api/workflows/:id/suspend', async (_, params) => {
    if (!spawner) {
      return serverError('Execution engine not available');
    }

    const workflowId = params.id;

    try {
      await spawner.suspend(workflowId);
      broadcaster?.emit('workflow:status', { id: workflowId, status: 'paused' });
      return ok({ id: workflowId, action: 'suspended' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return badRequest(`Failed to suspend execution: ${msg}`);
    }
  });

  // Resume workflow execution
  router.post('/api/workflows/:id/resume', async (_, params) => {
    if (!spawner) {
      return serverError('Execution engine not available');
    }

    const workflowId = params.id;

    try {
      await spawner.resume(workflowId);
      broadcaster?.emit('workflow:status', { id: workflowId, status: 'in_progress' });
      return ok({ id: workflowId, action: 'resumed' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return badRequest(`Failed to resume execution: ${msg}`);
    }
  });

  // Get execution status
  router.get('/api/workflows/:id/execution-status', (_, params) => {
    if (!spawner) {
      return ok({ running: false, agentCount: 0, available: false });
    }

    const status = spawner.getStatus(params.id);
    if (!status) {
      return ok({ running: false, agentCount: 0, available: true });
    }

    return ok({ ...status, available: true });
  });
}
