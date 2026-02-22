import type { DatabaseType } from '@caw/core';
import { workflowService, workspaceService } from '@caw/core';
import { getSpawner } from './registry';
import { WorkflowSpawner } from './spawner.service';
import type { PermissionMode, SpawnerConfig } from './types';

export interface AutoResumeResult {
  resumed: string[];
  skipped: string[];
  errors: Array<{ workflowId: string; error: string }>;
}

interface PersistedSpawnerConfig {
  max_agents: number;
  model: string;
  permission_mode: string;
  max_turns: number;
  max_budget_usd: number | null;
  ephemeral_worktree: boolean;
}

export interface ResumeOptions {
  mcpServerUrl: string;
  cwd: string;
  onAwaitingMerge?: (workflowId: string, prUrls: string[]) => Promise<void>;
}

export async function resumeWorkflows(
  db: DatabaseType,
  options: ResumeOptions,
): Promise<AutoResumeResult> {
  const result: AutoResumeResult = { resumed: [], skipped: [], errors: [] };

  // Find all in_progress workflows
  const { workflows } = workflowService.list(db, {
    status: 'in_progress',
    limit: 100,
  });

  for (const wf of workflows) {
    // Skip if a spawner is already registered for this workflow
    if (getSpawner(wf.id)) {
      result.skipped.push(wf.id);
      continue;
    }

    // Parse spawner_config from workflow config JSON
    const fullWorkflow = workflowService.get(db, wf.id);
    if (!fullWorkflow) {
      result.skipped.push(wf.id);
      continue;
    }

    let savedConfig: PersistedSpawnerConfig | undefined;
    try {
      const config = fullWorkflow.config ? JSON.parse(fullWorkflow.config) : {};
      savedConfig = config.spawner_config;
    } catch {
      // Invalid JSON in config
    }

    if (!savedConfig) {
      result.skipped.push(wf.id);
      continue;
    }

    try {
      // Derive branch and cwd from active workspace if available
      const workspaces = workspaceService.list(db, wf.id, 'active');
      const activeWorkspace = workspaces[0];

      const spawnerConfig: SpawnerConfig = {
        workflowId: wf.id,
        maxAgents: savedConfig.max_agents,
        model: savedConfig.model,
        permissionMode: savedConfig.permission_mode as PermissionMode,
        maxTurns: savedConfig.max_turns,
        maxBudgetUsd: savedConfig.max_budget_usd ?? undefined,
        mcpServerUrl: options.mcpServerUrl,
        cwd: activeWorkspace?.path ?? options.cwd,
        branch: activeWorkspace?.branch,
        issueContext: fullWorkflow.source_content ?? undefined,
        ephemeralWorktree: savedConfig.ephemeral_worktree,
      };

      const spawner = new WorkflowSpawner(db, spawnerConfig);

      // Wire up basic event listeners for logging
      // Use queueMicrotask to defer shutdown so spawner.start() can finish returning
      spawner.on('workflow_all_complete', ({ workflowId }) => {
        console.error(`[auto-resume] Workflow ${workflowId} completed`);
        queueMicrotask(() => spawner.shutdown());
      });
      spawner.on('workflow_awaiting_merge', async ({ workflowId, prUrls }) => {
        console.error(`[auto-resume] Workflow ${workflowId} awaiting merge: ${prUrls.join(', ')}`);
        if (options.onAwaitingMerge) {
          await options.onAwaitingMerge(workflowId, prUrls);
        }
        queueMicrotask(() => spawner.shutdown());
      });
      spawner.on('workflow_stalled', ({ workflowId, reason }) => {
        console.error(`[auto-resume] Workflow ${workflowId} stalled: ${reason}`);
        queueMicrotask(() => spawner.shutdown());
      });
      spawner.on('workflow_failed', ({ workflowId, error }) => {
        console.error(`[auto-resume] Workflow ${workflowId} failed: ${error}`);
        queueMicrotask(() => spawner.shutdown());
      });

      const spawnResult = await spawner.start();
      if (spawnResult.success) {
        result.resumed.push(wf.id);
      } else {
        result.errors.push({ workflowId: wf.id, error: spawnResult.error ?? 'Unknown error' });
      }
    } catch (err) {
      result.errors.push({
        workflowId: wf.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
