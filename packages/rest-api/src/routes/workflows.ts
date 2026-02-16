import type { DatabaseType, WorkflowStatus } from '@caw/core';
import { workflowService } from '@caw/core';
import {
  badRequest,
  created,
  getSearchParams,
  notFound,
  ok,
  parseBody,
  serverError,
} from '../response';
import type { Router } from '../router';
import type { Broadcaster } from '../ws/broadcaster';

export function registerWorkflowRoutes(
  router: Router,
  db: DatabaseType,
  broadcaster?: Broadcaster,
) {
  // List workflows
  router.get('/api/workflows', (req) => {
    const params = getSearchParams(req);
    const status = params.get('status');
    const limit = params.get('limit');
    const offset = params.get('offset');

    const filters: { status?: WorkflowStatus | WorkflowStatus[]; limit?: number; offset?: number } =
      {};
    if (status) {
      filters.status = status.includes(',')
        ? (status.split(',') as WorkflowStatus[])
        : (status as WorkflowStatus);
    }
    if (limit) {
      const n = Number(limit);
      if (!Number.isFinite(n) || n < 0) return badRequest('limit must be a non-negative number');
      filters.limit = n;
    }
    if (offset) {
      const n = Number(offset);
      if (!Number.isFinite(n) || n < 0) return badRequest('offset must be a non-negative number');
      filters.offset = n;
    }

    const result = workflowService.list(db, filters);
    return ok(result.workflows, {
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    });
  });

  // Get workflow
  router.get('/api/workflows/:id', (_, params) => {
    const includeTasks = true;
    const workflow = workflowService.get(db, params.id, { includeTasks });
    if (!workflow) return notFound(`Workflow not found: ${params.id}`);
    return ok(workflow);
  });

  // Create workflow
  router.post('/api/workflows', async (req) => {
    const body = await parseBody<{
      name: string;
      source_type: string;
      source_ref?: string;
      source_content?: string;
      repository_paths?: string[];
      max_parallel_tasks?: number;
      auto_create_workspaces?: boolean;
      config?: Record<string, unknown>;
    }>(req);

    if (!body) return badRequest('Invalid JSON body');
    if (!body.name) return badRequest('name is required');
    if (!body.source_type) return badRequest('source_type is required');

    try {
      const workflow = workflowService.create(db, body);
      broadcaster?.emit('workflow:status', { id: workflow.id, status: workflow.status });
      return created(workflow);
    } catch (err) {
      return serverError(err instanceof Error ? err.message : String(err));
    }
  });

  // Update workflow status
  router.put('/api/workflows/:id/status', async (req, params) => {
    const body = await parseBody<{ status: WorkflowStatus; reason?: string }>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.status) return badRequest('status is required');

    try {
      const workflow = workflowService.updateStatus(db, params.id, body.status, body.reason);
      broadcaster?.emit('workflow:status', { id: workflow.id, status: workflow.status });
      return ok(workflow);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Set workflow plan
  router.put('/api/workflows/:id/plan', async (req, params) => {
    const body = await parseBody<{ summary: string; tasks: Array<Record<string, unknown>> }>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.summary) return badRequest('summary is required');
    if (!body.tasks) return badRequest('tasks is required');

    try {
      // Cast tasks to the expected type — the service validates structure
      const result = workflowService.setPlan(
        db,
        params.id,
        body as unknown as Parameters<typeof workflowService.setPlan>[2],
      );
      broadcaster?.emit('workflow:status', { id: params.id, status: 'ready' });
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Get workflow summary
  router.get('/api/workflows/:id/summary', (req, params) => {
    const format = getSearchParams(req).get('format') === 'markdown' ? 'markdown' : 'json';
    try {
      const result = workflowService.getSummary(db, params.id, format);
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return serverError(msg);
    }
  });
}
