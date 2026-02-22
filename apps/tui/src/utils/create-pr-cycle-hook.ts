import type { CycleMode, DatabaseType } from '@caw/core';
import { loadConfig, resolveCycleMode, workflowService, workspaceService } from '@caw/core';
import type { PostCompletionHook } from '@caw/spawner';

export interface PrCycleHookOptions {
  repoPath: string;
  port: number;
  model?: string;
  cycleOverride?: CycleMode;
}

/**
 * Factory that creates a PostCompletionHook wrapping runCycle() with proper
 * 4-level cycle mode resolution: CLI flag > workspace > workflow > config > 'off'.
 */
export function createPrCycleHook(
  db: DatabaseType,
  options: PrCycleHookOptions,
): PostCompletionHook {
  return async (workflowId: string) => {
    const config = loadConfig(options.repoPath);
    const workspaces = workspaceService.list(db, workflowId, 'active');
    const activeWorkspace = workspaces[0] ?? null;
    const workflow = workflowService.get(db, workflowId);
    const cycleMode = resolveCycleMode(
      options.cycleOverride,
      activeWorkspace,
      workflow,
      config.config,
    );

    if (cycleMode === 'off') return;

    console.log(`\nStarting PR cycle (mode: ${cycleMode})...`);
    const { runCycle } = await import('../commands/pr');
    await runCycle(db, {
      subcommand: 'cycle',
      workflowId,
      repoPath: options.repoPath,
      port: options.port,
      model: options.model,
      cycle: cycleMode,
    });
  };
}
