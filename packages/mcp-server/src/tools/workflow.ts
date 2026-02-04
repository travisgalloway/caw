import { repositoryService, workflowService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall } from './types';

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
        if (!workflow) throw new Error(`Workflow not found: ${args.id}`);
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
      }),
  );

  defineTool(
    server,
    'workflow_update_status',
    {
      description: 'Update workflow status',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
        status: z.string().describe('New status'),
        reason: z.string().optional().describe('Reason for status change'),
      },
    },
    (args) =>
      handleToolCall(() => {
        workflowService.updateStatus(db, args.id, args.status, args.reason);
        return { success: true };
      }),
  );

  defineTool(
    server,
    'workflow_set_parallelism',
    {
      description: 'Update workflow parallelism settings',
      inputSchema: {
        id: z.string().describe('Workflow ID'),
        max_parallel_tasks: z.number().int().describe('1 = sequential, >1 = parallel'),
        auto_create_workspaces: z.boolean().optional().describe('Auto-create worktrees'),
      },
    },
    (args) =>
      handleToolCall(() => {
        workflowService.setParallelism(
          db,
          args.id,
          args.max_parallel_tasks,
          args.auto_create_workspaces,
        );
        return { success: true };
      }),
  );
};
