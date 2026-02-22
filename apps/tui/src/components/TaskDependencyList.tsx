import type { TaskWithCheckpoints } from '@caw/core';
import { taskService } from '@caw/core';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { useDb } from '../context/db';
import { ScrollArea } from './ScrollArea';
import { StatusIndicator } from './StatusIndicator';

interface TaskDependencyListProps {
  taskId: string;
  direction: 'dependsOn' | 'blocks';
  onSelectTask: (taskId: string) => void;
  isFocused?: boolean;
}

export function TaskDependencyList({
  taskId,
  direction,
  onSelectTask,
  isFocused = true,
}: TaskDependencyListProps): React.JSX.Element {
  const db = useDb();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Get dependencies
  const { dependencies, dependents } = taskService.getDependencies(db, taskId);

  // Get the relevant list based on direction
  const depList = direction === 'dependsOn' ? dependencies : dependents;

  // Resolve to full Task objects
  const tasks = depList
    .map((dep) => {
      const id = direction === 'dependsOn' ? dep.depends_on_id : dep.task_id;
      return taskService.get(db, id);
    })
    .filter((t): t is TaskWithCheckpoints => t !== null);

  useInput(
    (_input, key) => {
      if (tasks.length === 0) return;

      if (key.upArrow) {
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        setSelectedIndex(Math.min(tasks.length - 1, selectedIndex + 1));
      } else if (key.return) {
        const task = tasks[selectedIndex];
        if (task) {
          onSelectTask(task.id);
        }
      }
    },
    { isActive: isFocused },
  );

  if (tasks.length === 0) {
    const emptyMessage = direction === 'dependsOn' ? 'No dependencies' : 'Not blocking any tasks';
    return (
      <Box paddingLeft={2}>
        <Text dimColor>{emptyMessage}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <ScrollArea focusIndex={selectedIndex}>
        {tasks.map((task, idx) => {
          const isSelected = isFocused && idx === selectedIndex;
          return (
            <Box key={task.id} gap={1}>
              <StatusIndicator kind="task" status={task.status} />
              <Text inverse={isSelected} dimColor>
                {task.id}
              </Text>
              <Text inverse={isSelected}>{task.name}</Text>
            </Box>
          );
        })}
      </ScrollArea>
    </Box>
  );
}
