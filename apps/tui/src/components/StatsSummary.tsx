import { Box, Text } from 'ink';
import type React from 'react';
import { useAgents } from '../hooks/useAgents';
import { useAllMessages } from '../hooks/useMessages';
import { THEME } from '../utils/theme';

interface StatsSummaryProps {
  workflowCount: number;
}

export function StatsSummary({ workflowCount }: StatsSummaryProps): React.JSX.Element {
  const agents = useAgents();
  const messages = useAllMessages();

  const onlineAgents = (agents.data ?? []).filter((a) => a.status === 'online').length;
  const unreadMessages = messages.data?.totalUnread ?? 0;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.muted} paddingX={1}>
      <Text bold>Summary</Text>
      <Box gap={1}>
        <Text bold color={THEME.accent}>
          {workflowCount}
        </Text>
        <Text dimColor>active workflows</Text>
      </Box>
      <Box gap={1}>
        <Text bold color={THEME.success}>
          {onlineAgents}
        </Text>
        <Text dimColor>agents online</Text>
      </Box>
      <Box gap={1}>
        <Text bold color={THEME.warning}>
          {unreadMessages}
        </Text>
        <Text dimColor>unread messages</Text>
      </Box>
    </Box>
  );
}
