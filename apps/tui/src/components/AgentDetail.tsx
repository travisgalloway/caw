import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useAgentDetail } from '../hooks/useAgentDetail';
import { useAppStore } from '../store';
import { MessageInbox } from './MessageInbox';
import { StatusIndicator } from './StatusIndicator';

interface AgentDetailProps {
  agentId: string | null;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return 'never';
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return 'offline';
}

export function AgentDetail({ agentId }: AgentDetailProps): React.JSX.Element {
  const { setView } = useAppStore();
  const { data, error } = useAgentDetail(agentId);

  useInput((_input, key) => {
    if (key.escape) {
      setView('dashboard');
    }
  });

  if (!agentId) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No agent selected</Text>
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

  const { agent, messages, unreadCount, capabilities } = data;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        <Box gap={1}>
          <Text bold>Agent Detail</Text>
        </Box>
        <Box gap={1}>
          <StatusIndicator kind="agent" status={agent.status} />
          <Text bold>{agent.name}</Text>
          <Text dimColor>[{agent.status}]</Text>
        </Box>

        {/* Runtime and role */}
        <Box gap={1}>
          <Text dimColor>Runtime:</Text>
          <Text>{agent.runtime}</Text>
          <Text dimColor>Role:</Text>
          <Text>{agent.role}</Text>
        </Box>

        {/* Current task */}
        {agent.current_task_id && (
          <Box gap={1}>
            <Text dimColor>Current task:</Text>
            <Text color="yellow">{agent.current_task_id}</Text>
          </Box>
        )}

        {/* Workspace */}
        {agent.workspace_path && (
          <Box gap={1}>
            <Text dimColor>Workspace:</Text>
            <Text>{agent.workspace_path}</Text>
          </Box>
        )}

        {/* Heartbeat */}
        <Box gap={1}>
          <Text dimColor>Last heartbeat:</Text>
          <Text>{formatRelativeTime(agent.last_heartbeat)}</Text>
        </Box>

        {/* Timestamps */}
        <Box gap={1}>
          <Text dimColor>Created:</Text>
          <Text>{formatTimestamp(agent.created_at)}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Updated:</Text>
          <Text>{formatTimestamp(agent.updated_at)}</Text>
        </Box>

        {/* Capabilities */}
        {capabilities.length > 0 && (
          <Box gap={1}>
            <Text dimColor>Capabilities:</Text>
            <Text>{capabilities.join(', ')}</Text>
          </Box>
        )}
      </Box>

      {/* Messages section */}
      <MessageInbox
        messages={messages}
        unreadCount={unreadCount.count}
        agentId={agentId}
        isFocused
      />

      {/* Footer hint */}
      <Box paddingX={1}>
        <Text dimColor>Press Esc to return to dashboard</Text>
      </Box>
    </Box>
  );
}
