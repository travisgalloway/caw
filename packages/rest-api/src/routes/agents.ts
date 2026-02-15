import type { AgentRole, AgentStatus, DatabaseType } from '@caw/core';
import { agentService } from '@caw/core';
import { badRequest, created, getSearchParams, notFound, ok, parseBody } from '../response';
import type { Router } from '../router';
import type { Broadcaster } from '../ws/broadcaster';

export function registerAgentRoutes(router: Router, db: DatabaseType, broadcaster?: Broadcaster) {
  // List agents
  router.get('/api/agents', (req) => {
    const sp = getSearchParams(req);
    const status = sp.get('status') as AgentStatus | null;
    const role = sp.get('role') as AgentRole | null;
    const runtime = sp.get('runtime');
    const workflowId = sp.get('workflow_id');

    const filters: {
      status?: AgentStatus;
      role?: AgentRole;
      runtime?: string;
      workflow_id?: string;
    } = {};
    if (status) filters.status = status;
    if (role) filters.role = role;
    if (runtime) filters.runtime = runtime;
    if (workflowId) filters.workflow_id = workflowId;

    const agents = agentService.list(db, filters);
    return ok(agents);
  });

  // Get agent
  router.get('/api/agents/:id', (_, params) => {
    const agent = agentService.get(db, params.id);
    if (!agent) return notFound(`Agent not found: ${params.id}`);
    return ok(agent);
  });

  // Register agent
  router.post('/api/agents', async (req) => {
    const body = await parseBody<{
      name: string;
      runtime: string;
      role?: AgentRole;
      workflow_id?: string;
      capabilities?: string[];
      workspace_path?: string;
      metadata?: Record<string, unknown>;
    }>(req);

    if (!body) return badRequest('Invalid JSON body');
    if (!body.name) return badRequest('name is required');
    if (!body.runtime) return badRequest('runtime is required');

    const agent = agentService.register(db, body);
    broadcaster?.emit('agent:registered', { id: agent.id, name: agent.name });
    return created(agent);
  });

  // Update agent
  router.put('/api/agents/:id', async (req, params) => {
    const body = await parseBody<{
      status?: AgentStatus;
      current_task_id?: string | null;
      workspace_path?: string;
      capabilities?: string[];
      metadata?: Record<string, unknown>;
    }>(req);

    if (!body) return badRequest('Invalid JSON body');

    try {
      const agent = agentService.update(db, params.id, body);
      return ok(agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Heartbeat
  router.put('/api/agents/:id/heartbeat', async (req, params) => {
    const body = await parseBody<{ current_task_id?: string; status?: AgentStatus }>(req);

    try {
      const agent = agentService.heartbeat(db, params.id, body?.current_task_id, body?.status);
      broadcaster?.emit('agent:heartbeat', { id: agent.id, timestamp: agent.last_heartbeat });
      return ok(agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Unregister agent
  router.delete('/api/agents/:id', (_, params) => {
    try {
      const result = agentService.unregister(db, params.id);
      broadcaster?.emit('agent:unregistered', { id: params.id });
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });
}
