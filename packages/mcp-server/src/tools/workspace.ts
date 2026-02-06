import type { WorkspaceStatus } from '@caw/core';
import { createWorktree, removeWorktree, workspaceService } from '@caw/core';
import { z } from 'zod';
import {
  requireWorkflowLock,
  requireWorkflowLockForTask,
  requireWorkflowLockForWorkspace,
} from './lock-guard';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall, handleToolCallAsync, ToolCallError } from './types';

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
        session_id: z.string().optional().describe('Session ID for lock enforcement'),
        path: z
          .string()
          .optional()
          .describe('Workspace path (auto-generated when create_worktree is true)'),
        branch: z.string().describe('Branch name'),
        base_branch: z.string().optional().describe('Base branch'),
        task_ids: z.array(z.string()).optional().describe('Tasks assigned to this workspace'),
        create_worktree: z.boolean().optional().describe('Actually create a git worktree on disk'),
        repo_path: z
          .string()
          .optional()
          .describe('Repository path (required when create_worktree is true)'),
      },
    },
    (args) => {
      if (args.create_worktree) {
        if (!args.repo_path) {
          throw new ToolCallError({
            code: 'MISSING_REPO_PATH',
            message: 'repo_path is required when create_worktree is true',
            recoverable: true,
            suggestion: 'Provide repo_path pointing to the git repository root',
          });
        }
        return handleToolCallAsync(async () => {
          requireWorkflowLock(db, args.workflow_id, args.session_id);
          const worktreePath = await createWorktree(args.repo_path, args.branch, args.base_branch);
          try {
            const workspace = workspaceService.create(db, {
              workflowId: args.workflow_id,
              path: worktreePath,
              branch: args.branch,
              baseBranch: args.base_branch,
              taskIds: args.task_ids,
              repositoryPath: args.repo_path,
            });
            return { id: workspace.id, path: worktreePath };
          } catch (err) {
            // Best-effort cleanup of the worktree on DB error
            try {
              await removeWorktree(worktreePath);
            } catch {
              // Ignore cleanup errors
            }
            toToolCallError(err);
          }
        });
      }

      return handleToolCall(() => {
        try {
          requireWorkflowLock(db, args.workflow_id, args.session_id);
          if (!args.path) {
            throw new ToolCallError({
              code: 'MISSING_PATH',
              message: 'path is required when create_worktree is not true',
              recoverable: true,
              suggestion: 'Provide a workspace path or set create_worktree to true',
            });
          }
          const workspace = workspaceService.create(db, {
            workflowId: args.workflow_id,
            path: args.path,
            branch: args.branch,
            baseBranch: args.base_branch,
            taskIds: args.task_ids,
            repositoryPath: args.repo_path,
          });
          return { id: workspace.id };
        } catch (err) {
          toToolCallError(err);
        }
      });
    },
  );

  defineTool(
    server,
    'workspace_update',
    {
      description: 'Update workspace status',
      inputSchema: {
        id: z.string().describe('Workspace ID'),
        session_id: z.string().optional().describe('Session ID for lock enforcement'),
        status: z.enum(['active', 'merged', 'abandoned']).optional().describe('New status'),
        merge_commit: z.string().optional().describe('Merge commit SHA'),
        cleanup_worktree: z.boolean().optional().describe('Remove the git worktree from disk'),
      },
    },
    (args) => {
      const status = args.status as WorkspaceStatus | undefined;

      if (args.cleanup_worktree && status && (status === 'abandoned' || status === 'merged')) {
        return handleToolCallAsync(async () => {
          try {
            requireWorkflowLockForWorkspace(db, args.id, args.session_id);
            const workspace = workspaceService.get(db, args.id);
            if (!workspace) {
              throw new Error('Workspace not found');
            }
            workspaceService.update(db, args.id, {
              status,
              mergeCommit: args.merge_commit,
            });
            await removeWorktree(workspace.path);
            return { success: true, worktree_removed: true };
          } catch (err) {
            toToolCallError(err);
          }
        });
      }

      return handleToolCall(() => {
        try {
          requireWorkflowLockForWorkspace(db, args.id, args.session_id);
          workspaceService.update(db, args.id, {
            status,
            mergeCommit: args.merge_commit,
          });
          return { success: true };
        } catch (err) {
          toToolCallError(err);
        }
      });
    },
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
        session_id: z.string().optional().describe('Session ID for lock enforcement'),
        workspace_id: z.string().describe('Workspace ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          requireWorkflowLockForTask(db, args.task_id, args.session_id);
          workspaceService.assignTask(db, args.task_id, args.workspace_id);
          return { success: true };
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );
};
