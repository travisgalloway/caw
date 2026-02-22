import type { DatabaseType, WorkspaceStatus } from '@caw/core';
import { workspaceService } from '@caw/core';
import { badRequest, created, getSearchParams, notFound, ok, parseBody } from '../response';
import type { Router } from '../router';

export function registerWorkspaceRoutes(router: Router, db: DatabaseType) {
  // List workspaces for a workflow
  router.get('/api/workflows/:id/workspaces', (req, params) => {
    const sp = getSearchParams(req);
    const status = sp.get('status') as WorkspaceStatus | null;

    const workspaces = workspaceService.list(db, params.id, status ?? undefined);
    return ok(workspaces);
  });

  // Get workspace
  router.get('/api/workspaces/:id', (_, params) => {
    const workspace = workspaceService.get(db, params.id);
    if (!workspace) return notFound(`Workspace not found: ${params.id}`);
    return ok(workspace);
  });

  // Create workspace
  router.post('/api/workflows/:id/workspaces', async (req, params) => {
    const body = await parseBody<{
      path: string;
      branch: string;
      base_branch?: string;
      task_ids?: string[];
      repository_id?: string;
      repository_path?: string;
    }>(req);

    if (!body) return badRequest('Invalid JSON body');
    if (!body.path) return badRequest('path is required');
    if (!body.branch) return badRequest('branch is required');

    try {
      const workspace = workspaceService.create(db, {
        workflowId: params.id,
        path: body.path,
        branch: body.branch,
        baseBranch: body.base_branch,
        taskIds: body.task_ids,
        repositoryId: body.repository_id,
        repositoryPath: body.repository_path,
      });
      return created(workspace);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Update workspace
  router.put('/api/workspaces/:id', async (req, params) => {
    const body = await parseBody<{
      status?: WorkspaceStatus;
      merge_commit?: string;
      pr_url?: string;
      config?: Record<string, unknown>;
    }>(req);
    if (!body) return badRequest('Invalid JSON body');

    try {
      const workspace = workspaceService.update(db, params.id, {
        status: body.status,
        mergeCommit: body.merge_commit,
        prUrl: body.pr_url,
        config: body.config,
      });
      return ok(workspace);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });
}
