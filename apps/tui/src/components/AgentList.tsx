import type { Agent } from '@caw/core';
import { Box, Text } from 'ink';
import type React from 'react';
import { useAppStore } from '../store';
import { StatusIndicator } from './StatusIndicator';

interface AgentListProps {
  agents: Agent[];
}

export function AgentList({ agents }: AgentListProps): React.JSX.Element {
  const { activePanel, selectedAgentId } = useAppStore();
  const isFocused = activePanel === 'agents';

  return (
    <Box
      flexDirection="column"
      borderStyle={isFocused ? 'bold' : 'single'}
      borderColor={isFocused ? 'cyan' : undefined}
      paddingX={1}
    >
      <Text bold>Agents</Text>
      {agents.length === 0 ? (
        <Text dimColor>No agents</Text>
      ) : (
        agents.map((agent) => {
          const isSelected = agent.id === selectedAgentId;
          const displayId = agent.id.slice(0, 10);
          const taskInfo = agent.current_task_id ? agent.current_task_id.slice(0, 10) : '';

          return (
            <Box key={agent.id} gap={1}>
              <StatusIndicator kind="agent" status={agent.status} />
              <Text inverse={isSelected} dimColor={!isSelected}>
                {displayId}
              </Text>
              <Text inverse={isSelected} bold={isSelected}>
                {agent.name}
              </Text>
              <Text dimColor>[{agent.status}]</Text>
              {taskInfo && <Text color="yellow">{taskInfo}</Text>}
            </Box>
          );
        })
      )}
    </Box>
  );
}
