import type { DatabaseType } from '@caw/core';
import { applyCors, handlePreflight } from './middleware';
import type { Router } from './router';
import { createRouter } from './router';
import { registerAgentRoutes } from './routes/agents';
import { registerCheckpointRoutes } from './routes/checkpoints';
import { registerLockRoutes } from './routes/locks';
import { registerMessageRoutes } from './routes/messages';
import { registerOrchestrationRoutes } from './routes/orchestration';
import { registerTaskRoutes } from './routes/tasks';
import { registerTemplateRoutes } from './routes/templates';
import { registerWorkflowRoutes } from './routes/workflows';
import { registerWorkspaceRoutes } from './routes/workspaces';
import type { Broadcaster } from './ws/broadcaster';

export interface RestApi {
  router: Router;
  handle: (req: Request) => Response | Promise<Response>;
}

export function createRestApi(db: DatabaseType, broadcaster?: Broadcaster): RestApi {
  const router = createRouter();

  // Register all route groups
  registerWorkflowRoutes(router, db, broadcaster);
  registerTaskRoutes(router, db, broadcaster);
  registerOrchestrationRoutes(router, db);
  registerAgentRoutes(router, db, broadcaster);
  registerMessageRoutes(router, db, broadcaster);
  registerWorkspaceRoutes(router, db);
  registerTemplateRoutes(router, db);
  registerCheckpointRoutes(router, db);
  registerLockRoutes(router, db);

  async function handle(req: Request): Promise<Response> {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return handlePreflight();
    }

    try {
      const response = await router.handle(req);
      return applyCors(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorResponse = new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
      return applyCors(errorResponse);
    }
  }

  return { router, handle };
}
