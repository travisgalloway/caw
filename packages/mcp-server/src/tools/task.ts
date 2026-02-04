import { taskService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall, ToolCallError } from './types';

function toToolCallError(err: unknown): never {
  if (err instanceof ToolCallError) throw err;
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('Task not found')) {
    throw new ToolCallError({
      code: 'TASK_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the task ID and try again',
    });
  }
  if (msg.includes('Invalid transition')) {
    throw new ToolCallError({
      code: 'INVALID_TRANSITION',
      message: msg,
      recoverable: false,
      suggestion: 'Check valid transitions in task state machine',
    });
  }
  if (msg.includes("Cannot transition to 'planning'")) {
    throw new ToolCallError({
      code: 'TASK_BLOCKED',
      message: msg,
      recoverable: true,
      suggestion: 'Wait for blocking dependencies to complete',
    });
  }
  if (msg.includes('Cannot set plan')) {
    throw new ToolCallError({
      code: 'INVALID_STATE',
      message: msg,
      recoverable: false,
      suggestion: "Task must be in 'planning' status to set plan",
    });
  }
  if (msg.includes('Outcome is required')) {
    throw new ToolCallError({
      code: 'MISSING_OUTCOME',
      message: msg,
      recoverable: true,
      suggestion: "Provide an outcome when setting status to 'completed'",
    });
  }
  if (msg.includes('Error is required')) {
    throw new ToolCallError({
      code: 'MISSING_ERROR',
      message: msg,
      recoverable: true,
      suggestion: "Provide an error when setting status to 'failed'",
    });
  }
  if (msg.includes('Cannot replan')) {
    throw new ToolCallError({
      code: 'INVALID_STATE',
      message: msg,
      recoverable: false,
      suggestion: "Task must be 'failed' or 'in_progress' to replan",
    });
  }

  throw err;
}

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'task_get',
    {
      description: 'Get task details',
      inputSchema: {
        id: z.string().describe('Task ID'),
        include_checkpoints: z.boolean().optional().describe('Include checkpoints, default false'),
        checkpoint_limit: z.number().int().optional().describe('Max checkpoints to return'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const task = taskService.get(db, args.id, {
          includeCheckpoints: args.include_checkpoints,
          checkpointLimit: args.checkpoint_limit,
        });
        if (!task) {
          throw new ToolCallError({
            code: 'TASK_NOT_FOUND',
            message: `Task not found: ${args.id}`,
            recoverable: false,
            suggestion: 'Check the task ID and try again',
          });
        }
        return task;
      }),
  );

  defineTool(
    server,
    'task_set_plan',
    {
      description: 'Set task plan (when task moves to planning status)',
      inputSchema: {
        id: z.string().describe('Task ID'),
        plan: z.object({
          approach: z.string(),
          steps: z.array(z.string()),
          files_to_modify: z.array(z.string()).optional(),
          files_to_create: z.array(z.string()).optional(),
          context_needed: z.array(z.string()).optional(),
        }),
        context: z.record(z.unknown()).optional().describe('Additional context to store'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          taskService.setPlan(db, args.id, {
            plan: args.plan,
            context: args.context,
          });
          return { success: true };
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'task_update_status',
    {
      description: 'Update task status',
      inputSchema: {
        id: z.string().describe('Task ID'),
        status: z.string().describe('New status'),
        outcome: z.string().optional().describe('Required for completed'),
        outcome_detail: z.record(z.unknown()).optional().describe('Additional outcome detail'),
        error: z.string().optional().describe('Required for failed'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          taskService.updateStatus(db, args.id, args.status, {
            outcome: args.outcome,
            error: args.error,
          });
          return { success: true };
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'task_replan',
    {
      description: 'Replan a failed or in-progress task',
      inputSchema: {
        id: z.string().describe('Task ID'),
        reason: z.string().describe('Reason for replanning'),
        new_plan: z.object({
          approach: z.string(),
          steps: z.array(z.string()),
          files_to_modify: z.array(z.string()).optional(),
          files_to_create: z.array(z.string()).optional(),
        }),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          const result = taskService.replan(db, args.id, args.reason, args.new_plan);
          return { success: true, checkpoint_id: result.checkpoint_id };
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );
};
