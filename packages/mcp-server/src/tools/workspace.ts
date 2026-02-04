import type { WorkspaceStatus } from '@caw/core';
import { workspaceService } from '@caw/core';
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
  if (msg.includes('does not belong to workflow')) {
    throw new ToolCallError({
      code: 'WORKFLOW_MISMATCH',
      message: msg,
      recoverable: false,
      suggestion: 'Task must belong to the same workflow as the workspace',
    });
  }
  if (msg.includes('Workspace not found')) {
    throw new ToolCallError({
      code: 'WORKSPACE_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the workspace ID and try again',
    });
  }
  if (msg.includes('mergeCommit is required')) {
    throw new ToolCallError({
      code: 'MISSING_MERGE_COMMIT',
      message: msg,
      recoverable: true,
      suggestion: "Provide merge_commit when setting status to 'merged'",
    });
  }
  if (msg.includes('Cannot assign task to workspace')) {
    throw new ToolCallError({
      code: 'INVALID_STATE',
      message: msg,
      recoverable: false,
      suggestion: "Workspace must be 'active' to assign tasks",
    });
  }

  throw err;
}

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'workspace_create',
    {
      description: 'Register a workspace (git worktree) for parallel task execution',
      inputSchema: {
        workflow_id: z.string().describe('Workflow ID'),
        path: z.string().describe('Workspace path'),
        branch: z.string().describe('Branch name'),
        base_branch: z.string().optional().describe('Base branch'),
        task_ids: z.array(z.string()).optional().describe('Tasks assigned to this workspace'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          const workspace = workspaceService.create(db, {
            workflowId: args.workflow_id,
            path: args.path,
            branch: args.branch,
            baseBranch: args.base_branch,
            taskIds: args.task_ids,
          });
          return { id: workspace.id };
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workspace_update',
    {
      description: 'Update workspace status',
      inputSchema: {
        id: z.string().describe('Workspace ID'),
        status: z.enum(['active', 'merged', 'abandoned']).optional().describe('New status'),
        merge_commit: z.string().optional().describe('Merge commit SHA'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          workspaceService.update(db, args.id, {
            status: args.status as WorkspaceStatus | undefined,
            mergeCommit: args.merge_commit,
          });
          return { success: true };
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'workspace_list',
    {
      description: 'List workspaces for a workflow',
      inputSchema: {
        workflow_id: z.string().describe('Workflow ID'),
        status: z.array(z.string()).optional().describe('Filter by status'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const workspaces = workspaceService.list(
          db,
          args.workflow_id,
          args.status as WorkspaceStatus[] | undefined,
        );
        return { workspaces };
      }),
  );

  defineTool(
    server,
    'task_assign_workspace',
    {
      description: 'Assign task to workspace',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
        workspace_id: z.string().describe('Workspace ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          workspaceService.assignTask(db, args.task_id, args.workspace_id);
          return { success: true };
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );
};
