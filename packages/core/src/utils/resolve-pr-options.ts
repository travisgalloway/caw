import type { CawConfig } from '../config/schema';
import type { Workflow } from '../types/workflow';
import type { Workspace } from '../types/workspace';

export type CycleMode = 'auto' | 'hitl' | 'off';

function parseCycleFromConfig(configJson: string | null | undefined): CycleMode | undefined {
  if (!configJson) return undefined;
  try {
    const parsed = JSON.parse(configJson);
    const cycle = parsed?.pr?.cycle;
    if (cycle === 'auto' || cycle === 'hitl' || cycle === 'off') return cycle;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve cycle mode with 4-level priority:
 * CLI flag > workspace config > workflow config > file config > default 'off'
 */
export function resolveCycleMode(
  cliFlag: CycleMode | undefined,
  workspace: Pick<Workspace, 'config'> | null | undefined,
  workflow: Pick<Workflow, 'config'> | null | undefined,
  fileConfig: CawConfig | null | undefined,
): CycleMode {
  if (cliFlag) return cliFlag;

  const fromWorkspace = parseCycleFromConfig(workspace?.config);
  if (fromWorkspace) return fromWorkspace;

  const fromWorkflow = parseCycleFromConfig(workflow?.config);
  if (fromWorkflow) return fromWorkflow;

  if (fileConfig?.pr?.cycle) return fileConfig.pr.cycle;

  return 'off';
}
