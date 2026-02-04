import type { AgentRole, AgentStatus } from '@caw/core';
import { agentService, taskService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall } from './types';

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'agent_register',
    {
      description: 'Register a new agent. Called on agent startup.',
      inputSchema: {
        name: z.string().describe('Human-friendly name'),
        runtime: z.enum(['claude_code', 'codex', 'opencode', 'custom']).describe('Agent runtime'),
        role: z.enum(['coordinator', 'worker']).optional().describe("Default 'worker'"),
        capabilities: z.array(z.string()).optional().describe('e.g., typescript, python, testing'),
        workspace_path: z.string().optional().describe('Workspace path'),
        metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const agent = agentService.register(db, {
          name: args.name,
          runtime: args.runtime,
          role: args.role as AgentRole | undefined,
          capabilities: args.capabilities,
          workspace_path: args.workspace_path,
          metadata: args.metadata,
        });
        return { id: agent.id, name: agent.name, status: agent.status };
      }),
  );

  defineTool(
    server,
    'agent_heartbeat',
    {
      description: 'Send heartbeat to keep agent online. Should be called periodically.',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        current_task_id: z.string().optional().describe('Task being worked on'),
        status: z.enum(['online', 'busy']).optional().describe('Agent status'),
      },
    },
    (args) =>
      handleToolCall(() => {
        agentService.heartbeat(
          db,
          args.agent_id,
          args.current_task_id,
          args.status as AgentStatus | undefined,
        );
        return { success: true, next_heartbeat_ms: 30000 };
      }),
  );

  defineTool(
    server,
    'agent_update',
    {
      description: 'Update agent status',
      inputSchema: {
        id: z.string().describe('Agent ID'),
        status: z.enum(['online', 'offline', 'busy']).optional().describe('New status'),
        current_task_id: z.string().nullable().optional().describe('Current task ID or null'),
        workspace_path: z.string().optional().describe('Workspace path'),
        metadata: z.record(z.unknown()).optional().describe('Metadata to merge'),
      },
    },
    (args) =>
      handleToolCall(() => {
        agentService.update(db, args.id, {
          status: args.status as AgentStatus | undefined,
          current_task_id: args.current_task_id,
          workspace_path: args.workspace_path,
          metadata: args.metadata,
        });
        return { success: true };
      }),
  );

  defineTool(
    server,
    'agent_get',
    {
      description: 'Get agent details',
      inputSchema: {
        id: z.string().describe('Agent ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const agent = agentService.get(db, args.id);
        if (!agent) throw new Error(`Agent not found: ${args.id}`);
        return agent;
      }),
  );

  defineTool(
    server,
    'agent_list',
    {
      description: 'List agents',
      inputSchema: {
        status: z
          .array(z.enum(['online', 'offline', 'busy']))
          .optional()
          .describe('Filter by status'),
        role: z.enum(['coordinator', 'worker']).optional().describe('Filter by role'),
        runtime: z.string().optional().describe('Filter by runtime'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const agents = agentService.list(db, {
          status: args.status as AgentStatus[] | undefined,
          role: args.role as AgentRole | undefined,
          runtime: args.runtime,
        });
        return { agents };
      }),
  );

  defineTool(
    server,
    'agent_unregister',
    {
      description: 'Unregister agent (mark offline). Called on agent shutdown.',
      inputSchema: {
        id: z.string().describe('Agent ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        return agentService.unregister(db, args.id);
      }),
  );

  defineTool(
    server,
    'task_claim',
    {
      description: 'Claim a task for an agent. Atomically assigns task if unclaimed.',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
        agent_id: z.string().describe('Agent ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        return taskService.claim(db, args.task_id, args.agent_id);
      }),
  );

  defineTool(
    server,
    'task_release',
    {
      description: 'Release a task claim',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
        agent_id: z.string().describe('Agent ID'),
        reason: z.string().optional().describe('Reason for release'),
      },
    },
    (args) =>
      handleToolCall(() => {
        taskService.release(db, args.task_id, args.agent_id, args.reason);
        return { success: true };
      }),
  );

  defineTool(
    server,
    'task_get_available',
    {
      description: 'Get available (unclaimed, unblocked) tasks for an agent',
      inputSchema: {
        workflow_id: z.string().optional().describe('Filter by workflow'),
        agent_id: z.string().describe('For capability matching'),
        limit: z.number().int().optional().describe('Max results'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const tasks = taskService.getAvailable(db, {
          workflow_id: args.workflow_id,
          limit: args.limit,
        });
        return { tasks };
      }),
  );
};
