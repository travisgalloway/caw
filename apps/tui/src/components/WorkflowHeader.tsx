import type { ProgressResult, WorkflowWithTasks, Workspace } from '@caw/core';
import { loadConfig, resolveCycleMode } from '@caw/core';
import { Box, Text } from 'ink';
import type React from 'react';
import { formatTimestamp } from '../utils/format';
import { THEME } from '../utils/theme';
import { ProgressBar } from './ProgressBar';
import { StatusIndicator } from './StatusIndicator';

interface WorkflowHeaderProps {
  workflow: WorkflowWithTasks;
  progress: ProgressResult | null;
  workspaceCount: number;
  workspaces?: Workspace[];
}

function resolveCycleModeSource(
  workspaces: Workspace[] | undefined,
  workflow: WorkflowWithTasks,
): { mode: string; source: string } | null {
  const activeWs = workspaces?.find((ws) => ws.status === 'active') ?? workspaces?.[0];
  let cawConfig = null;
  try {
    cawConfig = loadConfig().config;
  } catch {
    // config file may not exist
  }
  const mode = resolveCycleMode(undefined, activeWs ?? null, workflow, cawConfig);
  if (mode === 'off') return null;

  const parseConfig = (cfg: string | null | undefined) => {
    if (!cfg) return undefined;
    try {
      return JSON.parse(cfg)?.pr?.cycle;
    } catch {
      return undefined;
    }
  };

  let source = 'default';
  if (activeWs && parseConfig(activeWs.config)) {
    source = 'workspace';
  } else if (parseConfig(workflow.config)) {
    source = 'workflow';
  } else if (cawConfig?.pr?.cycle) {
    source = 'config';
  }

  return { mode, source };
}

export function WorkflowHeader({
  workflow,
  progress,
  workspaceCount,
  workspaces,
}: WorkflowHeaderProps): React.JSX.Element {
  const completed = progress?.by_status.completed ?? 0;
  const total = progress?.total_tasks ?? 0;
  const cycleInfo = resolveCycleModeSource(workspaces, workflow);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.muted} paddingX={1}>
      <Box justifyContent="space-between">
        <Box gap={1}>
          <StatusIndicator kind="workflow" status={workflow.status} />
          <Text bold>{workflow.name}</Text>
        </Box>
        <Text dimColor>[{workflow.status}]</Text>
      </Box>

      <Box gap={2}>
        <Box gap={1}>
          <Text dimColor>Source:</Text>
          <Text>{workflow.source_type}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Parallel:</Text>
          <Text>max {workflow.max_parallel_tasks}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Workspaces:</Text>
          <Text>{workspaceCount}</Text>
        </Box>
        {cycleInfo && (
          <Box gap={1}>
            <Text dimColor>Cycle:</Text>
            <Text>
              {cycleInfo.mode} ({cycleInfo.source})
            </Text>
          </Box>
        )}
      </Box>

      <Box gap={2}>
        <Box gap={1}>
          <Text dimColor>Created:</Text>
          <Text>{formatTimestamp(workflow.created_at)}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Updated:</Text>
          <Text>{formatTimestamp(workflow.updated_at)}</Text>
        </Box>
      </Box>

      {progress && total > 0 && (
        <Box gap={1}>
          <Text dimColor>Progress</Text>
          <ProgressBar completed={completed} total={total} width={20} />
          {Object.entries(progress.by_status).map(([status, count]) => (
            <Text key={status} dimColor>
              {status}: {count}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
