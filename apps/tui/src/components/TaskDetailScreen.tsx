import { Box, Text } from 'ink';
import type React from 'react';
import { useTaskDetail } from '../hooks/useTaskDetail';
import { useAppStore } from '../store';
import { formatTimestamp } from '../utils/format';
import { THEME } from '../utils/theme';
import { CheckpointTimeline } from './CheckpointTimeline';
import { StatusIndicator } from './StatusIndicator';
import { TaskDependencyList } from './TaskDependencyList';

interface TaskDetailScreenProps {
  workflowId: string;
  taskId: string;
}

export function TaskDetailScreen({ workflowId, taskId }: TaskDetailScreenProps): React.JSX.Element {
  const push = useAppStore((state) => state.push);
  const { data: task, error } = useTaskDetail(taskId);

  const handleSelectTask = (selectedTaskId: string) => {
    push({
      screen: 'task-detail',
      workflowId,
      taskId: selectedTaskId,
    });
  };

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  if (!task) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={THEME.muted}
        paddingX={2}
        paddingY={1}
        marginX={1}
      >
        <Box gap={1}>
          <StatusIndicator kind="task" status={task.status} />
          <Text bold>{task.name}</Text>
          <Text dimColor>[{task.status}]</Text>
        </Box>

        <Text> </Text>

        <Box gap={1}>
          <Text dimColor>ID:</Text>
          <Text>{task.id}</Text>
        </Box>

        <Box gap={1}>
          <Text dimColor>Sequence:</Text>
          <Text>{task.sequence}</Text>
        </Box>

        {task.assigned_agent_id && (
          <Box gap={1}>
            <Text dimColor>Agent:</Text>
            <Text color="yellow">{task.assigned_agent_id}</Text>
          </Box>
        )}

        {task.parallel_group && (
          <Box gap={1}>
            <Text dimColor>Parallel group:</Text>
            <Text>{task.parallel_group}</Text>
          </Box>
        )}

        <Box gap={1}>
          <Text dimColor>Created:</Text>
          <Text>{formatTimestamp(task.created_at)}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Updated:</Text>
          <Text>{formatTimestamp(task.updated_at)}</Text>
        </Box>

        {task.description && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              Description
            </Text>
            <Text>{task.description}</Text>
          </Box>
        )}

        {task.plan_summary && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              Plan
            </Text>
            <Text>{task.plan_summary}</Text>
          </Box>
        )}

        {task.outcome && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              Outcome
            </Text>
            <Text>{task.outcome}</Text>
          </Box>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1} marginX={1}>
        <Text bold dimColor>
          Depends On
        </Text>
        <TaskDependencyList taskId={taskId} direction="dependsOn" onSelectTask={handleSelectTask} />
      </Box>

      <Box flexDirection="column" marginTop={1} marginX={1}>
        <Text bold dimColor>
          Blocks
        </Text>
        <TaskDependencyList taskId={taskId} direction="blocks" onSelectTask={handleSelectTask} />
      </Box>

      <Box flexDirection="column" marginTop={1} marginX={1}>
        <Text bold dimColor>
          Checkpoints
        </Text>
        <CheckpointTimeline checkpoints={task.checkpoints || []} />
      </Box>

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>Esc back | ↑↓ navigate dependencies | Enter view task</Text>
      </Box>
    </Box>
  );
}
