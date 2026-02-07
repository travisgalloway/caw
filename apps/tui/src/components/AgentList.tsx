import type { Agent } from '@caw/core';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { StatusIndicator } from './StatusIndicator';

interface AgentListProps {
  agents: Agent[];
  totalUnread?: number;
}

export function AgentList({ agents, totalUnread }: AgentListProps): React.JSX.Element {
  const { activePanel, selectAgent, setView } = useAppStore();
  const promptFocused = useAppStore((s) => s.promptFocused);
  const isFocused = activePanel === 'agents';
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when agents array changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: agents.length is a stable proxy for the list changing
  useEffect(() => {
    setSelectedIndex(0);
  }, [agents.length]);

  useInput(
    (_input, key) => {
      if (!agents || agents.length === 0) return;

      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(agents.length - 1, prev + 1));
      } else if (key.return && !promptFocused) {
        const agent = agents[selectedIndex];
        if (agent) {
          selectAgent(agent.id);
          setView('agent-detail');
        }
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle={isFocused ? 'bold' : 'single'}
      borderColor={isFocused ? 'cyan' : undefined}
      paddingX={1}
    >
      <Box gap={1}>
        <Text bold>Agents</Text>
        {totalUnread !== undefined && totalUnread > 0 && (
          <Text color="yellow">({totalUnread} unread)</Text>
        )}
      </Box>
      {agents.length === 0 ? (
        <Text dimColor>No agents</Text>
      ) : (
        agents.map((agent, index) => {
          const isSelected = isFocused && index === selectedIndex;
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
