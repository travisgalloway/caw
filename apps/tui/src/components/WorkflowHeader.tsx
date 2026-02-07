import type { ProgressResult, WorkflowWithTasks } from '@caw/core';
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
}

export function WorkflowHeader({
  workflow,
  progress,
  workspaceCount,
}: WorkflowHeaderProps): React.JSX.Element {
  const completed = progress?.by_status.completed ?? 0;
  const total = progress?.total_tasks ?? 0;

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
