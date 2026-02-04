import { templateService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall } from './types';

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'template_create',
    {
      description: 'Create a workflow template from an existing workflow or a definition',
      inputSchema: {
        name: z.string().describe('Template name'),
        description: z.string().optional().describe('Template description'),
        from_workflow_id: z.string().optional().describe('Source workflow to templatize'),
        template: z
          .object({
            tasks: z.array(
              z.object({
                name: z.string(),
                description: z.string().optional(),
                parallel_group: z.string().optional(),
                depends_on: z.array(z.string()).optional(),
              }),
            ),
            variables: z.array(z.string()).optional(),
          })
          .optional()
          .describe('Template definition'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const tmpl = templateService.create(db, {
          name: args.name,
          description: args.description,
          fromWorkflowId: args.from_workflow_id,
          template: args.template,
        });
        return { id: tmpl.id };
      }),
  );

  defineTool(
    server,
    'template_list',
    {
      description: 'List available templates',
    },
    () =>
      handleToolCall(() => {
        const templates = templateService.list(db);
        return { templates };
      }),
  );

  defineTool(
    server,
    'template_apply',
    {
      description: 'Create a workflow from a template',
      inputSchema: {
        template_id: z.string().describe('Template ID'),
        workflow_name: z.string().describe('Name for the new workflow'),
        variables: z.record(z.string()).optional().describe('Template variables'),
        repository_path: z.string().optional().describe('Repository path'),
        max_parallel_tasks: z.number().int().optional().describe('Max parallel tasks'),
      },
    },
    (args) =>
      handleToolCall(() => {
        return templateService.apply(db, args.template_id, {
          workflowName: args.workflow_name,
          variables: args.variables,
          repoPath: args.repository_path,
          maxParallel: args.max_parallel_tasks,
        });
      }),
  );
};
