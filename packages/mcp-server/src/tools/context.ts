import { contextService } from '@caw/core';
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
  if (msg.includes('Workflow not found')) {
    throw new ToolCallError({
      code: 'WORKFLOW_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: "The task's workflow could not be found",
    });
  }

  throw err;
}

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'task_load_context',
    {
      description:
        'Load optimized context for a task. Primary tool for context recovery after clearing.',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
        include: z
          .object({
            workflow_plan: z.boolean().optional().describe('Include workflow plan, default true'),
            workflow_summary: z
              .boolean()
              .optional()
              .describe('Include workflow summary, default true'),
            prior_task_outcomes: z
              .boolean()
              .optional()
              .describe('Include prior task outcomes, default true'),
            prior_task_full: z
              .boolean()
              .optional()
              .describe('Include full prior task details, default false'),
            sibling_status: z
              .boolean()
              .optional()
              .describe('Include sibling task status, default true'),
            dependency_outcomes: z
              .boolean()
              .optional()
              .describe('Include dependency outcomes, default true'),
            all_checkpoints: z
              .boolean()
              .optional()
              .describe('Include all checkpoints, default false'),
            recent_checkpoints: z
              .number()
              .int()
              .optional()
              .describe('Number of recent checkpoints, default 5'),
          })
          .optional(),
        max_tokens: z.number().int().optional().describe('Token budget, default 8000'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          return contextService.loadTaskContext(db, args.task_id, {
            include: args.include
              ? {
                  workflow: args.include.workflow_plan ?? args.include.workflow_summary,
                  current_task: true,
                  prior_tasks: args.include.prior_task_outcomes,
                  siblings: args.include.sibling_status,
                  dependencies: args.include.dependency_outcomes,
                  all_checkpoints: args.include.all_checkpoints,
                }
              : undefined,
            max_tokens: args.max_tokens,
          });
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );
};
