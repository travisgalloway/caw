import { templateService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall, ToolCallError } from './types';

function toToolCallError(err: unknown): never {
  if (err instanceof ToolCallError) throw err;
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('Cannot provide both')) {
    throw new ToolCallError({
      code: 'INVALID_INPUT',
      message: msg,
      recoverable: true,
      suggestion: 'Provide either from_workflow_id or template, not both',
    });
  }
  if (msg.includes('Must provide either')) {
    throw new ToolCallError({
      code: 'INVALID_INPUT',
      message: msg,
      recoverable: true,
      suggestion: 'Provide either from_workflow_id or template',
    });
  }
  if (msg.includes('Workflow not found')) {
    throw new ToolCallError({
      code: 'WORKFLOW_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the workflow ID and try again',
    });
  }
  if (msg.includes('Template name already exists')) {
    throw new ToolCallError({
      code: 'DUPLICATE_TEMPLATE',
      message: msg,
      recoverable: true,
      suggestion: 'Choose a different template name',
    });
  }
  if (msg.includes('Template not found')) {
    throw new ToolCallError({
      code: 'TEMPLATE_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the template ID and try again',
    });
  }
  if (msg.includes('Missing required variables')) {
    throw new ToolCallError({
      code: 'MISSING_VARIABLES',
      message: msg,
      recoverable: true,
      suggestion: 'Provide all required template variables',
    });
  }

  throw err;
}

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
        try {
          const tmpl = templateService.create(db, {
            name: args.name,
            description: args.description,
            fromWorkflowId: args.from_workflow_id,
            template: args.template,
          });
          return { id: tmpl.id };
        } catch (err) {
          toToolCallError(err);
        }
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
        variables: z.record(z.string(), z.string()).optional().describe('Template variables'),
        repository_paths: z.array(z.string()).optional().describe('Repository paths to associate'),
        max_parallel_tasks: z.number().int().optional().describe('Max parallel tasks'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          return templateService.apply(db, args.template_id, {
            workflowName: args.workflow_name,
            variables: args.variables,
            repoPaths: args.repository_paths,
            maxParallel: args.max_parallel_tasks,
          });
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );
};
