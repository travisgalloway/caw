import { Box, Text } from 'ink';
import type React from 'react';
import { useAgentDetail } from '../hooks/useAgentDetail';
import { formatRelativeTime, formatTimestamp } from '../utils/format';
import { THEME } from '../utils/theme';
import { MessageInbox } from './MessageInbox';
import { StatusIndicator } from './StatusIndicator';

interface AgentDetailProps {
  agentId: string;
  workflowId?: string | null;
}

export function AgentDetail({ agentId }: AgentDetailProps): React.JSX.Element {
  const { data, error } = useAgentDetail(agentId);

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
      <Box flexDirection="column" borderStyle="round" borderColor={THEME.muted} paddingX={1}>
        <Text bold color={THEME.accent}>
          Agent Detail
        </Text>
        <Text> </Text>
        <Box justifyContent="space-between">
          <Box gap={1}>
            <StatusIndicator kind="agent" status={agent.status} />
            <Text bold>{agent.name}</Text>
          </Box>
          <Text dimColor>[{agent.status}]</Text>
        </Box>

        <Box gap={1}>
          <Text dimColor>Runtime:</Text>
          <Text>{agent.runtime}</Text>
          <Text dimColor>Role:</Text>
          <Text>{agent.role}</Text>
        </Box>

        {agent.current_task_id && (
          <Box gap={1}>
            <Text dimColor>Current task:</Text>
            <Text color="yellow">{agent.current_task_id}</Text>
          </Box>
        )}

        {agent.workspace_path && (
          <Box gap={1}>
            <Text dimColor>Workspace:</Text>
            <Text>{agent.workspace_path}</Text>
          </Box>
        )}

        <Box gap={1}>
          <Text dimColor>Last heartbeat:</Text>
          <Text>{formatRelativeTime(agent.last_heartbeat)}</Text>
        </Box>

        <Box gap={1}>
          <Text dimColor>Created:</Text>
          <Text>{formatTimestamp(agent.created_at)}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Updated:</Text>
          <Text>{formatTimestamp(agent.updated_at)}</Text>
        </Box>

        {capabilities.length > 0 && (
          <Box gap={1}>
            <Text dimColor>Capabilities:</Text>
            <Text>{capabilities.join(', ')}</Text>
          </Box>
        )}
      </Box>

      <MessageInbox
        messages={messages}
        unreadCount={unreadCount.count}
        agentId={agentId}
        isFocused
      />

      <Box paddingX={1}>
        <Text dimColor>Esc back</Text>
      </Box>
    </Box>
  );
}
