import type { AddTaskParams, DatabaseType, TaskStatus } from '@caw/core';
import { taskService, workflowReplanningService } from '@caw/core';
import { badRequest, created, getSearchParams, notFound, ok, parseBody } from '../response';
import type { Router } from '../router';
import type { Broadcaster } from '../ws/broadcaster';

export function registerTaskRoutes(router: Router, db: DatabaseType, broadcaster?: Broadcaster) {
  // List tasks for a workflow
  router.get('/api/workflows/:id/tasks', (_req, params) => {
    const workflow = db.prepare('SELECT id FROM workflows WHERE id = ?').get(params.id) as {
      id: string;
    } | null;
    if (!workflow) return notFound(`Workflow not found: ${params.id}`);

    const tasks = db
      .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence, name')
      .all(params.id);
    return ok(tasks);
  });

  // Get task
  router.get('/api/tasks/:id', (req, params) => {
    const sp = getSearchParams(req);
    const includeCheckpoints = sp.get('checkpoints') === 'true';
    const task = taskService.get(db, params.id, { includeCheckpoints });
    if (!task) return notFound(`Task not found: ${params.id}`);
    return ok(task);
  });

  // Update task status
  router.put('/api/tasks/:id/status', async (req, params) => {
    const body = await parseBody<{ status: TaskStatus; outcome?: string; error?: string }>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.status) return badRequest('status is required');

    try {
      const task = taskService.updateStatus(db, params.id, body.status, {
        outcome: body.outcome,
        error: body.error,
      });
      broadcaster?.emit('task:updated', {
        id: task.id,
        status: task.status,
        workflow_id: task.workflow_id,
      });
      return ok(task);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Set task plan
  router.put('/api/tasks/:id/plan', async (req, params) => {
    const body = await parseBody<{
      plan: Record<string, unknown>;
      context?: Record<string, unknown>;
    }>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.plan) return badRequest('plan is required');

    try {
      const task = taskService.setPlan(db, params.id, body);
      broadcaster?.emit('task:updated', {
        id: task.id,
        status: task.status,
        workflow_id: task.workflow_id,
      });
      return ok(task);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Claim task
  router.post('/api/tasks/:id/claim', async (req, params) => {
    const body = await parseBody<{ agent_id: string }>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.agent_id) return badRequest('agent_id is required');

    try {
      const result = taskService.claim(db, params.id, body.agent_id);
      if (result.success) {
        const task = taskService.get(db, params.id);
        broadcaster?.emit('task:updated', {
          id: params.id,
          action: 'claimed',
          agent_id: body.agent_id,
          workflow_id: task?.workflow_id,
        });
      }
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Release task
  router.post('/api/tasks/:id/release', async (req, params) => {
    const body = await parseBody<{ agent_id: string; reason?: string }>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.agent_id) return badRequest('agent_id is required');

    try {
      const task = taskService.get(db, params.id);
      taskService.release(db, params.id, body.agent_id, body.reason);
      broadcaster?.emit('task:updated', {
        id: params.id,
        action: 'released',
        agent_id: body.agent_id,
        workflow_id: task?.workflow_id,
      });
      return ok({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Add task to workflow
  router.post('/api/workflows/:id/tasks', async (req, params) => {
    const body = await parseBody<AddTaskParams>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.name) return badRequest('name is required');

    try {
      const result = workflowReplanningService.addTask(db, params.id, body);
      broadcaster?.emit('task:updated', {
        id: result.task_id,
        action: 'added',
        workflow_id: result.workflow_id,
      });
      return created(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Remove task from workflow
  router.delete('/api/workflows/:id/tasks/:taskId', (_req, params) => {
    try {
      const result = workflowReplanningService.removeTask(db, params.id, params.taskId);
      broadcaster?.emit('task:updated', {
        id: result.removed_task_id,
        action: 'removed',
        workflow_id: params.id,
      });
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Get task dependencies
  router.get('/api/tasks/:id/dependencies', (_, params) => {
    try {
      const deps = taskService.getDependencies(db, params.id);
      return ok(deps);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Get all task dependencies for a workflow (for tree/DAG visualization)
  router.get('/api/workflows/:id/dependencies', (_req, params) => {
    const workflow = db.prepare('SELECT id FROM workflows WHERE id = ?').get(params.id) as {
      id: string;
    } | null;
    if (!workflow) return notFound(`Workflow not found: ${params.id}`);

    // Get all tasks for the workflow
    const tasks = db
      .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence, name')
      .all(params.id);

    // Get all task dependencies for this workflow
    const dependencies = db
      .prepare(
        `SELECT td.* FROM task_dependencies td
         JOIN tasks t ON td.task_id = t.id
         WHERE t.workflow_id = ?`,
      )
      .all(params.id);

    return ok({ tasks, dependencies });
  });
}
