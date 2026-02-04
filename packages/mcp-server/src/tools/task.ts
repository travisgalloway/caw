import { taskService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall } from './types';

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
        if (!task) throw new Error(`Task not found: ${args.id}`);
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
        taskService.setPlan(db, args.id, {
          plan: args.plan,
          context: args.context,
        });
        return { success: true };
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
        taskService.updateStatus(db, args.id, args.status, {
          outcome: args.outcome,
          error: args.error,
        });
        return { success: true };
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
        const result = taskService.replan(db, args.id, args.reason, args.new_plan);
        return { success: true, checkpoint_id: result.checkpoint_id };
      }),
  );
};
