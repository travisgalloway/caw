import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useWorkflowDetail } from '../hooks/useWorkflowDetail';
import { useAppStore } from '../store';
import { formatTimestamp } from '../utils/format';
import { ProgressBar } from './ProgressBar';
import { StatusIndicator } from './StatusIndicator';
import { TaskDag } from './TaskDag';
import { TaskTree } from './TaskTree';

export function WorkflowDetail({ workflowId }: { workflowId: string | null }): React.JSX.Element {
  const { setView } = useAppStore();
  const taskViewMode = useAppStore((s) => s.taskViewMode);
  const { data, error } = useWorkflowDetail(workflowId);

  useInput((_input, key) => {
    if (key.escape) {
      setView('active-workflows');
    }
  });

  if (!workflowId) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No workflow selected</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  const { workflow, progress, workspaces } = data;
  const completed = progress?.by_status.completed ?? 0;
  const total = progress?.total_tasks ?? 0;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        <Box gap={1}>
          <Text bold>Workflow Detail</Text>
        </Box>
        <Box gap={1}>
          <StatusIndicator kind="workflow" status={workflow.status} />
          <Text bold>{workflow.name}</Text>
          <Text dimColor>[{workflow.status}]</Text>
        </Box>

        {/* Source info */}
        <Box gap={1}>
          <Text dimColor>Source:</Text>
          <Text>{workflow.source_type}</Text>
          {workflow.source_ref && <Text dimColor>(ref: {workflow.source_ref})</Text>}
        </Box>

        {/* Parallelism config */}
        <Box gap={1}>
          <Text dimColor>Parallelism:</Text>
          <Text>max {workflow.max_parallel_tasks} tasks</Text>
          {workflow.auto_create_workspaces === 1 && <Text dimColor>(auto worktrees)</Text>}
        </Box>

        {/* Timestamps */}
        <Box gap={1}>
          <Text dimColor>Created:</Text>
          <Text>{formatTimestamp(workflow.created_at)}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Updated:</Text>
          <Text>{formatTimestamp(workflow.updated_at)}</Text>
        </Box>

        {/* Progress section */}
        {progress && total > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Box gap={1}>
              <Text dimColor>Progress</Text>
              <ProgressBar completed={completed} total={total} width={20} />
            </Box>
            <Box gap={1}>
              {Object.entries(progress.by_status).map(([status, count]) => (
                <Text key={status} dimColor>
                  {status}: {count}
                </Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {/* Tasks section */}
      {taskViewMode === 'dag' ? (
        <TaskDag workflowId={workflowId} />
      ) : (
        <TaskTree workflowId={workflowId} />
      )}

      {/* Workspaces section */}
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        <Text bold>Workspaces ({workspaces.length})</Text>
        {workspaces.length === 0 ? (
          <Text dimColor>No workspaces</Text>
        ) : (
          workspaces.map((ws) => (
            <Box key={ws.id} gap={1}>
              <StatusIndicator kind="workspace" status={ws.status} />
              <Text>{ws.branch}</Text>
              <Text dimColor>{ws.path}</Text>
            </Box>
          ))
        )}
      </Box>

      {/* Footer hint */}
      <Box paddingX={1}>
        <Text dimColor>Press Esc to return to workflows</Text>
      </Box>
    </Box>
  );
}
