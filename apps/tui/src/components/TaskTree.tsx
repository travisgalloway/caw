import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import type { TaskTreeNode } from '../hooks/useTasks';
import { useTasks } from '../hooks/useTasks';
import { useAppStore } from '../store';
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
        <Text>{indent}</Text>
        {parallelPrefix && <Text dimColor>{parallelPrefix}</Text>}
        <StatusIndicator kind="task" status={node.status} />
        <Text inverse={isSelected} bold={isSelected}>
          {node.name}
        </Text>
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
  const { activePanel, selectTask } = useAppStore();
  const isFocused = activePanel === 'tasks';
  const { data: tasks, error } = useTasks(workflowId);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput(
    (_input, key) => {
      if (!tasks || tasks.length === 0) return;

      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(tasks.length - 1, prev + 1));
      } else if (key.return) {
        const selectedTask = tasks[selectedIndex];
        if (selectedTask) {
          selectTask(selectedTask.id);
        }
      }
    },
    { isActive: isFocused },
  );

  if (error) {
    return (
      <Box
        flexDirection="column"
        borderStyle={isFocused ? 'bold' : 'single'}
        borderColor={isFocused ? 'cyan' : undefined}
        paddingX={1}
      >
        <Text bold>Tasks</Text>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle={isFocused ? 'bold' : 'single'}
      borderColor={isFocused ? 'cyan' : undefined}
      paddingX={1}
    >
      <Text bold>Tasks</Text>
      {!workflowId ? (
        <Text dimColor>Select a workflow</Text>
      ) : !tasks || tasks.length === 0 ? (
        <Text dimColor>No tasks</Text>
      ) : (
        tasks.map((task, index) => (
          <TaskNode key={task.id} node={task} isSelected={isFocused && index === selectedIndex} />
        ))
      )}
    </Box>
  );
}
