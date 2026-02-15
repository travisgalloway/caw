import type { DatabaseType } from '@caw/core';
import { templateService } from '@caw/core';
import { badRequest, created, notFound, ok, parseBody } from '../response';
import type { Router } from '../router';

export function registerTemplateRoutes(router: Router, db: DatabaseType) {
  // List templates
  router.get('/api/templates', () => {
    const templates = templateService.list(db);
    return ok(templates);
  });

  // Get template
  router.get('/api/templates/:id', (_, params) => {
    const template = templateService.get(db, params.id);
    if (!template) return notFound(`Template not found: ${params.id}`);
    return ok(template);
  });

  // Create template
  router.post('/api/templates', async (req) => {
    const body = await parseBody<{
      name: string;
      description?: string;
      from_workflow_id?: string;
      template?: { tasks: Array<Record<string, unknown>>; variables?: string[] };
    }>(req);

    if (!body) return badRequest('Invalid JSON body');
    if (!body.name) return badRequest('name is required');

    try {
      const template = templateService.create(db, {
        name: body.name,
        description: body.description,
        fromWorkflowId: body.from_workflow_id,
        template: body.template as Parameters<typeof templateService.create>[1]['template'],
      });
      return created(template);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Apply template
  router.post('/api/templates/:id/apply', async (req, params) => {
    const body = await parseBody<{
      workflow_name: string;
      variables?: Record<string, string>;
      repo_paths?: string[];
      max_parallel?: number;
    }>(req);

    if (!body) return badRequest('Invalid JSON body');
    if (!body.workflow_name) return badRequest('workflow_name is required');

    try {
      const result = templateService.apply(db, params.id, {
        workflowName: body.workflow_name,
        variables: body.variables,
        repoPaths: body.repo_paths,
        maxParallel: body.max_parallel,
      });
      return created(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });
}
