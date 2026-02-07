import { Box, Text } from 'ink';
import type React from 'react';
import type { TaskTreeNode } from '../hooks/useTasks';
import { useTasks } from '../hooks/useTasks';
import { THEME } from '../utils/theme';
import { StatusIndicator } from './StatusIndicator';

interface TaskNodeProps {
  node: TaskTreeNode;
}

function TaskNode({ node }: TaskNodeProps): React.JSX.Element {
  const indent = '  '.repeat(node.depth);
  const parallelPrefix = node.parallelGroup
    ? node.isLastInGroup
      ? '\u2514\u2500'
      : '\u251c\u2500'
    : '';

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text>{indent}</Text>
        {parallelPrefix && <Text dimColor>{parallelPrefix}</Text>}
        <StatusIndicator kind="task" status={node.status} />
        <Text>{node.name}</Text>
        {node.agentName && <Text color="yellow">({node.agentName})</Text>}
        {node.checkpointCount > 0 && <Text dimColor>[{node.checkpointCount} cp]</Text>}
      </Box>
      {node.blockedBy.length > 0 && (
        <Box>
          <Text>{indent}</Text>
          <Text dimColor> </Text>
          <Text color="red" dimColor>
            waiting on: {node.blockedBy.map((b) => b.name).join(', ')}
          </Text>
        </Box>
      )}
    </Box>
  );
}

interface TaskTreeProps {
  workflowId: string | null;
}

export function TaskTree({ workflowId }: TaskTreeProps): React.JSX.Element {
  const { data: tasks, error } = useTasks(workflowId);

  if (error) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={THEME.muted} paddingX={1}>
        <Text bold>Tasks (Tree)</Text>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.muted} paddingX={1}>
      <Text bold>Tasks (Tree)</Text>
      {!workflowId ? (
        <Text dimColor>Select a workflow</Text>
      ) : !tasks || tasks.length === 0 ? (
        <Text dimColor>No tasks</Text>
      ) : (
        tasks.map((task) => <TaskNode key={task.id} node={task} />)
      )}
    </Box>
  );
}
