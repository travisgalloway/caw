import { orchestrationService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall, ToolCallError } from './types';

function toToolCallError(err: unknown): never {
  if (err instanceof ToolCallError) throw err;
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('Workflow not found')) {
    throw new ToolCallError({
      code: 'WORKFLOW_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the workflow ID and try again',
    });
  }
  if (msg.includes('Task not found')) {
    throw new ToolCallError({
      code: 'TASK_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the task ID and try again',
    });
  }

  throw err;
}

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'workflow_next_tasks',
    {
      description: 'Get next actionable tasks that are unblocked and pending/failed',
      inputSchema: {
        workflow_id: z.string().describe('Workflow ID'),
        include_failed: z
          .boolean()
          .optional()
          .describe('Include failed tasks for retry, default true'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          return orchestrationService.getNextTasks(
            db,
            args.workflow_id,
            args.include_failed ?? true,
          );
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_progress',
    {
      description: 'Get workflow progress overview',
      inputSchema: {
        workflow_id: z.string().describe('Workflow ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          return orchestrationService.getProgress(db, args.workflow_id);
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'task_check_dependencies',
    {
      description: 'Check if task dependencies are satisfied',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          return orchestrationService.checkDependencies(db, args.task_id);
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );
};
