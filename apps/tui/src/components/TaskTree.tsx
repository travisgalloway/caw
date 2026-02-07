import { Box, Text, useInput } from 'ink';
import type React from 'react';
import type { TaskTreeNode } from '../hooks/useTasks';
import { useTasks } from '../hooks/useTasks';
import { THEME } from '../utils/theme';
import { ScrollArea } from './ScrollArea';
import { StatusIndicator } from './StatusIndicator';

interface TaskNodeProps {
  node: TaskTreeNode;
  isSelected: boolean;
}

function TaskNode({ node, isSelected }: TaskNodeProps): React.JSX.Element {
  const indent = '  '.repeat(node.depth);
  const parallelPrefix = node.parallelGroup
    ? node.isLastInGroup
      ? '\u2514\u2500'
      : '\u251c\u2500'
    : '';

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text inverse={isSelected}>{indent}</Text>
        {parallelPrefix && (
          <Text dimColor inverse={isSelected}>
            {parallelPrefix}
          </Text>
        )}
        <StatusIndicator kind="task" status={node.status} />
        <Text inverse={isSelected}>{node.name}</Text>
        {node.agentName && (
          <Text color="yellow" inverse={isSelected}>
            ({node.agentName})
          </Text>
        )}
        {node.checkpointCount > 0 && (
          <Text dimColor inverse={isSelected}>
            [{node.checkpointCount} cp]
          </Text>
        )}
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
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onConfirm: (taskId: string) => void;
  isFocused?: boolean;
}

export function TaskTree({
  workflowId,
  selectedIndex,
  onSelectIndex,
  onConfirm,
  isFocused = true,
}: TaskTreeProps): React.JSX.Element {
  const { data: tasks, error } = useTasks(workflowId);

  useInput(
    (_input, key) => {
      if (!tasks || tasks.length === 0) return;

      if (key.upArrow) {
        onSelectIndex(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        onSelectIndex(Math.min(tasks.length - 1, selectedIndex + 1));
      } else if (key.return) {
        const task = tasks[selectedIndex];
        if (task) {
          onConfirm(task.id);
        }
      }
    },
    { isActive: isFocused },
  );

  if (error) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={THEME.muted} paddingX={1}>
        <Text bold>Tasks (Tree)</Text>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={THEME.muted}
      paddingX={1}
      flexGrow={1}
    >
      <Text bold>Tasks (Tree)</Text>
      {!workflowId ? (
        <Text dimColor>Select a workflow</Text>
      ) : !tasks || tasks.length === 0 ? (
        <Text dimColor>No tasks</Text>
      ) : (
        <ScrollArea focusIndex={selectedIndex}>
          {tasks.map((task, idx) => (
            <TaskNode key={task.id} node={task} isSelected={isFocused && idx === selectedIndex} />
          ))}
        </ScrollArea>
      )}
    </Box>
  );
}
