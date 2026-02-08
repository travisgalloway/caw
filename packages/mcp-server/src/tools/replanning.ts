import { workflowService } from '@caw/core';
import { z } from 'zod';
import { requireWorkflowLock } from './lock-guard';
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
  if (msg.includes('Cannot modify plan')) {
    throw new ToolCallError({
      code: 'INVALID_STATE',
      message: msg,
      recoverable: false,
      suggestion: 'Workflow must be in ready, in_progress, or paused status',
    });
  }
  if (msg.includes('Duplicate task name')) {
    throw new ToolCallError({
      code: 'DUPLICATE_TASK_NAME',
      message: msg,
      recoverable: true,
      suggestion: 'Use a unique task name within the workflow',
    });
  }
  if (msg.includes('cannot depend on itself')) {
    throw new ToolCallError({
      code: 'SELF_DEPENDENCY',
      message: msg,
      recoverable: true,
      suggestion: 'A task cannot depend on itself',
    });
  }
  if (msg.includes('Unknown dependency')) {
    throw new ToolCallError({
      code: 'UNKNOWN_DEPENDENCY',
      message: msg,
      recoverable: true,
      suggestion: 'Check that dependency names match existing task names in the workflow',
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
  if (msg.includes('Cannot remove task')) {
    throw new ToolCallError({
      code: 'TASK_NOT_REMOVABLE',
      message: msg,
      recoverable: false,
      suggestion:
        'Only pending, blocked, or planning tasks that are not claimed by an agent can be removed',
    });
  }
  if (msg.includes('conflicts with a preserved task')) {
    throw new ToolCallError({
      code: 'NAME_CONFLICT',
      message: msg,
      recoverable: true,
      suggestion: 'New task names must not conflict with preserved (non-removable) tasks',
    });
  }

  throw err;
}

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'workflow_add_task',
    {
      description: 'Add a single task to an existing workflow plan',
      inputSchema: {
        workflow_id: z.string().describe('Workflow ID'),
        session_id: z.string().optional().describe('Session ID for lock enforcement'),
        name: z.string().describe('Task name (must be unique within workflow)'),
        description: z.string().optional().describe('Task description'),
        depends_on: z
          .array(z.string())
          .optional()
          .describe('Task names or IDs this task depends on'),
        parallel_group: z.string().optional().describe('Parallel execution group'),
        estimated_complexity: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .describe('Estimated complexity'),
        files_likely_affected: z
          .array(z.string())
          .optional()
          .describe('Files likely to be modified'),
        repository_path: z.string().optional().describe('Repository path for this task'),
        after_task: z
          .string()
          .optional()
          .describe('Insert after this task (name or ID). Default: append at end'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          requireWorkflowLock(db, args.workflow_id, args.session_id);
          return workflowService.addTask(db, args.workflow_id, {
            name: args.name,
            description: args.description,
            depends_on: args.depends_on,
            parallel_group: args.parallel_group,
            estimated_complexity: args.estimated_complexity,
            files_likely_affected: args.files_likely_affected,
            repository_path: args.repository_path,
            after_task: args.after_task,
          });
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_remove_task',
    {
      description:
        'Remove a pending/blocked/planning task from a workflow, re-wiring its dependencies',
      inputSchema: {
        workflow_id: z.string().describe('Workflow ID'),
        session_id: z.string().optional().describe('Session ID for lock enforcement'),
        task_id: z.string().describe('Task ID to remove'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          requireWorkflowLock(db, args.workflow_id, args.session_id);
          return workflowService.removeTask(db, args.workflow_id, args.task_id);
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_replan',
    {
      description:
        'Replace removable tasks with a new plan while preserving completed/in_progress/claimed tasks',
      inputSchema: {
        workflow_id: z.string().describe('Workflow ID'),
        session_id: z.string().optional().describe('Session ID for lock enforcement'),
        plan: z.object({
          summary: z.string().describe('New plan summary'),
          reason: z.string().describe('Reason for replanning'),
          tasks: z.array(
            z.object({
              name: z.string(),
              description: z.string().optional(),
              parallel_group: z.string().optional(),
              depends_on: z.array(z.string()).optional(),
              estimated_complexity: z.enum(['low', 'medium', 'high']).optional(),
              files_likely_affected: z.array(z.string()).optional(),
              repository_path: z.string().optional(),
            }),
          ),
        }),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          requireWorkflowLock(db, args.workflow_id, args.session_id);
          return workflowService.replan(db, args.workflow_id, {
            summary: args.plan.summary,
            reason: args.plan.reason,
            tasks: args.plan.tasks.map((t: Record<string, unknown>) => ({
              name: t.name as string,
              description: t.description as string | undefined,
              parallel_group: t.parallel_group as string | undefined,
              estimated_complexity: t.estimated_complexity as string | undefined,
              files_likely_affected: t.files_likely_affected as string[] | undefined,
              depends_on: t.depends_on as string[] | undefined,
              repository_path: t.repository_path as string | undefined,
            })),
          });
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );
};
