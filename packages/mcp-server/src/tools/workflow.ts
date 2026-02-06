import { lockService, repositoryService, workflowService } from '@caw/core';
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
  if (msg.includes('Invalid transition')) {
    throw new ToolCallError({
      code: 'INVALID_TRANSITION',
      message: msg,
      recoverable: false,
      suggestion: 'Check valid transitions in workflow state machine',
    });
  }
  if (msg.includes('Cannot set plan')) {
    throw new ToolCallError({
      code: 'INVALID_STATE',
      message: msg,
      recoverable: false,
      suggestion: "Workflow must be in 'planning' status",
    });
  }
  if (msg.includes('Duplicate task name')) {
    throw new ToolCallError({
      code: 'DUPLICATE_TASK_NAME',
      message: msg,
      recoverable: true,
      suggestion: 'Remove duplicate task names from the plan',
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
      suggestion: 'Check that dependency names match task names in the plan',
    });
  }
  if (msg.includes('Session not found')) {
    throw new ToolCallError({
      code: 'SESSION_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the session ID and try again',
    });
  }
  if (msg.includes('is locked by session')) {
    throw new ToolCallError({
      code: 'WORKFLOW_LOCKED',
      message: msg,
      recoverable: true,
      suggestion: 'The workflow is locked by another session. Unlock it first.',
    });
  }

  throw err;
}

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'workflow_create',
    {
      description: 'Create a new workflow',
      inputSchema: {
        name: z.string().describe('Workflow name'),
        source_type: z
          .enum(['prompt', 'github_issue', 'linear', 'jira', 'custom'])
          .describe('Source type'),
        source_ref: z.string().optional().describe('URL or identifier'),
        source_content: z.string().describe('The actual prompt/issue content'),
        repository_path: z.string().optional().describe('Repository path, defaults to cwd'),
        max_parallel_tasks: z.number().int().optional().describe('Max parallel tasks, default 1'),
        auto_create_workspaces: z
          .boolean()
          .optional()
          .describe('Auto-create worktrees for parallel tasks'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const workflow = workflowService.create(db, {
          name: args.name,
          source_type: args.source_type,
          source_ref: args.source_ref,
          source_content: args.source_content,
          repository_path: args.repository_path,
          max_parallel_tasks: args.max_parallel_tasks,
          auto_create_workspaces: args.auto_create_workspaces,
        });
        return {
          id: workflow.id,
          name: workflow.name,
          status: workflow.status,
          max_parallel_tasks: workflow.max_parallel_tasks,
        };
      }),
  );

  defineTool(
    server,
    'workflow_get',
    {
      description: 'Get workflow details',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
        include_tasks: z.boolean().optional().describe('Include tasks, default false'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const workflow = workflowService.get(db, args.id, {
          includeTasks: args.include_tasks,
        });
        if (!workflow) {
          throw new ToolCallError({
            code: 'WORKFLOW_NOT_FOUND',
            message: `Workflow not found: ${args.id}`,
            recoverable: false,
            suggestion: 'Check the workflow ID and try again',
          });
        }
        return workflow;
      }),
  );

  defineTool(
    server,
    'workflow_list',
    {
      description: 'List workflows',
      inputSchema: {
        repository_path: z.string().optional().describe('Filter by repository path (global mode)'),
        status: z.array(z.string()).optional().describe('Filter by status'),
        limit: z.number().int().optional().describe('Max results, default 20'),
        offset: z.number().int().optional().describe('Pagination offset'),
      },
    },
    (args) =>
      handleToolCall(() => {
        let repositoryId: string | undefined;
        if (args.repository_path) {
          const repo = repositoryService.getByPath(db, args.repository_path);
          if (repo) repositoryId = repo.id;
        }
        return workflowService.list(db, {
          repository_id: repositoryId,
          status: args.status,
          limit: args.limit,
          offset: args.offset,
        });
      }),
  );

  defineTool(
    server,
    'workflow_set_plan',
    {
      description: 'Set the initial plan for a workflow, creating all tasks',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
        session_id: z.string().optional().describe('Session ID for lock enforcement'),
        plan: z.object({
          summary: z.string().describe('Brief description'),
          tasks: z.array(
            z.object({
              name: z.string(),
              description: z.string().optional(),
              parallel_group: z.string().optional(),
              depends_on: z.array(z.string()).optional(),
              estimated_complexity: z.enum(['low', 'medium', 'high']).optional(),
              files_likely_affected: z.array(z.string()).optional(),
            }),
          ),
        }),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          requireWorkflowLock(db, args.id, args.session_id);
          return workflowService.setPlan(db, args.id, {
            summary: args.plan.summary,
            tasks: args.plan.tasks.map((t: Record<string, unknown>) => ({
              name: t.name as string,
              description: t.description as string | undefined,
              parallel_group: t.parallel_group as string | undefined,
              estimated_complexity: t.estimated_complexity as string | undefined,
              files_likely_affected: t.files_likely_affected as string[] | undefined,
              depends_on: t.depends_on as string[] | undefined,
            })),
          });
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_update_status',
    {
      description: 'Update workflow status',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
        session_id: z.string().optional().describe('Session ID for lock enforcement'),
        status: z.string().describe('New status'),
        reason: z.string().optional().describe('Reason for status change'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          requireWorkflowLock(db, args.id, args.session_id);
          workflowService.updateStatus(db, args.id, args.status, args.reason);
          return { success: true };
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_set_parallelism',
    {
      description: 'Update workflow parallelism settings',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
        session_id: z.string().optional().describe('Session ID for lock enforcement'),
        max_parallel_tasks: z.number().int().describe('1 = sequential, >1 = parallel'),
        auto_create_workspaces: z.boolean().optional().describe('Auto-create worktrees'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          requireWorkflowLock(db, args.id, args.session_id);
          workflowService.setParallelism(
            db,
            args.id,
            args.max_parallel_tasks,
            args.auto_create_workspaces,
          );
          return { success: true };
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_get_summary',
    {
      description: 'Get compressed workflow summary for quick status checks',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
        format: z.enum(['json', 'markdown']).optional().describe('Output format, default json'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          return workflowService.getSummary(db, args.id, args.format ?? 'json');
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_lock',
    {
      description: 'Acquire a write lock on a workflow for the given session',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
        session_id: z.string().describe('Session ID to lock for'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          return lockService.lock(db, args.id, args.session_id);
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_unlock',
    {
      description: 'Release a write lock on a workflow',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
        session_id: z.string().describe('Session ID that holds the lock'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          return lockService.unlock(db, args.id, args.session_id);
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workflow_lock_info',
    {
      description: 'Get lock information for a workflow',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          return lockService.getLockInfo(db, args.id);
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );
};
