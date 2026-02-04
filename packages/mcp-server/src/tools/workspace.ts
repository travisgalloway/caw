import type { WorkspaceStatus } from '@caw/core';
import { workspaceService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall } from './types';

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
        const workspace = workspaceService.create(db, {
          workflowId: args.workflow_id,
          path: args.path,
          branch: args.branch,
          baseBranch: args.base_branch,
          taskIds: args.task_ids,
        });
        return { id: workspace.id };
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
        workspaceService.update(db, args.id, {
          status: args.status as WorkspaceStatus | undefined,
          mergeCommit: args.merge_commit,
        });
        return { success: true };
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
        workspaceService.assignTask(db, args.task_id, args.workspace_id);
        return { success: true };
      }),
  );
};
