import { orchestrationService, workflowService } from '@caw/core';
import { z } from 'zod';
import { DEFAULT_PORT } from '../config';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCallAsync, ToolCallError } from './types';

function toToolCallError(err: unknown): never {
  if (err instanceof ToolCallError) throw err;
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('not found')) {
    throw new ToolCallError({
      code: 'WORKFLOW_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the workflow ID and try again',
    });
  }
  if (msg.includes('already running')) {
    throw new ToolCallError({
      code: 'ALREADY_RUNNING',
      message: msg,
      recoverable: false,
      suggestion: 'Use workflow_suspend to stop the current execution first',
    });
  }
  if (msg.includes('not running')) {
    throw new ToolCallError({
      code: 'NOT_RUNNING',
      message: msg,
      recoverable: false,
      suggestion: 'Use workflow_start to begin execution first',
    });
  }
  if (msg.includes('not suspended')) {
    throw new ToolCallError({
      code: 'NOT_SUSPENDED',
      message: msg,
      recoverable: false,
      suggestion: 'Workflow must be suspended before it can be resumed',
    });
  }
  throw new ToolCallError({
    code: 'SPAWNER_ERROR',
    message: msg,
    recoverable: false,
    suggestion: 'Check spawner logs for details',
  });
}

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'workflow_start',
    {
      description:
        'Start executing a workflow by spawning Claude Code agents. Agents automatically claim and work on tasks, reporting progress through checkpoints.',
      inputSchema: {
        workflow_id: z.string().describe('The workflow ID to execute'),
        max_agents: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe(
            'Maximum number of concurrent agents (default: from workflow max_parallel_tasks)',
          ),
        model: z.string().optional().describe('Claude model to use (default: claude-sonnet-4-5)'),
        permission_mode: z
          .enum(['acceptEdits', 'bypassPermissions'])
          .optional()
          .describe('Permission mode for agents (default: bypassPermissions)'),
        max_turns: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Maximum turns per task agent (default: 50)'),
        max_budget_usd: z.number().min(0).optional().describe('Maximum budget per task in USD'),
        cwd: z
          .string()
          .optional()
          .describe('Working directory for agents (default: current directory)'),
      },
    },
    (args) =>
      handleToolCallAsync(async () => {
        const { WorkflowSpawner, getSpawner } = await import('@caw/spawner');

        const existing = getSpawner(args.workflow_id);
        if (existing) {
          const status = existing.getStatus();
          if (status.status === 'running') {
            throw new Error('Spawner is already running for this workflow');
          }
        }

        const workflow = workflowService.get(db, args.workflow_id);
        if (!workflow) {
          throw new Error(`Workflow not found: ${args.workflow_id}`);
        }

        const maxAgents = args.max_agents ?? workflow.max_parallel_tasks ?? 3;

        try {
          const spawner = new WorkflowSpawner(db, {
            workflowId: args.workflow_id,
            maxAgents,
            model: args.model ?? 'claude-sonnet-4-5',
            permissionMode: args.permission_mode ?? 'bypassPermissions',
            maxTurns: args.max_turns ?? 50,
            maxBudgetUsd: args.max_budget_usd,
            mcpServerUrl: `http://localhost:${DEFAULT_PORT}/mcp`,
            cwd: args.cwd ?? process.cwd(),
          });

          const result = await spawner.start();
          return result;
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_suspend',
    {
      description:
        'Gracefully stop all agents working on a workflow. In-progress tasks are paused, agents are unregistered, and the workflow transitions to paused.',
      inputSchema: {
        workflow_id: z.string().describe('The workflow ID to suspend'),
      },
    },
    (args) =>
      handleToolCallAsync(async () => {
        const { getSpawner } = await import('@caw/spawner');

        const spawner = getSpawner(args.workflow_id);
        if (!spawner) {
          throw new ToolCallError({
            code: 'NOT_RUNNING',
            message: `No active spawner for workflow: ${args.workflow_id}`,
            recoverable: false,
            suggestion: 'The workflow may not have been started with workflow_start',
          });
        }

        try {
          return await spawner.suspend();
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_resume',
    {
      description:
        'Resume a suspended workflow by re-spawning agents for available and paused tasks.',
      inputSchema: {
        workflow_id: z.string().describe('The workflow ID to resume'),
      },
    },
    (args) =>
      handleToolCallAsync(async () => {
        const { getSpawner } = await import('@caw/spawner');

        const spawner = getSpawner(args.workflow_id);
        if (!spawner) {
          throw new ToolCallError({
            code: 'NOT_SUSPENDED',
            message: `No active spawner for workflow: ${args.workflow_id}`,
            recoverable: false,
            suggestion:
              'The workflow may not have been started with workflow_start, or has been fully shut down',
          });
        }

        try {
          return await spawner.resume();
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_execution_status',
    {
      description:
        'Get the current execution status of a workflow, including agent handles, progress, and spawner state.',
      inputSchema: {
        workflow_id: z.string().describe('The workflow ID to check'),
      },
    },
    (args) =>
      handleToolCallAsync(async () => {
        const { getSpawner } = await import('@caw/spawner');

        const spawner = getSpawner(args.workflow_id);
        if (spawner) {
          return spawner.getStatus();
        }

        // No active spawner — return progress from DB
        const progress = orchestrationService.getProgress(db, args.workflow_id);
        return {
          workflowId: args.workflow_id,
          status: 'idle' as const,
          agents: [],
          progress: {
            totalTasks: progress.total_tasks,
            completed: progress.by_status.completed ?? 0,
            inProgress: progress.by_status.in_progress ?? 0,
            failed: progress.by_status.failed ?? 0,
            remaining: progress.estimated_remaining,
          },
          startedAt: null,
          suspendedAt: null,
        };
      }),
  );
};
