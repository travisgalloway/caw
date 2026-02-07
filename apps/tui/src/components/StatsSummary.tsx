import type { WorkflowStatus } from '@caw/core';
import { workflowService } from '@caw/core';
import { Box, Text } from 'ink';
import type React from 'react';
import { useDb } from '../context/db';
import { useAgents } from '../hooks/useAgents';
import { useAllMessages } from '../hooks/useMessages';
import { usePolling } from '../hooks/usePolling';
import { useAppStore } from '../store';
import { THEME } from '../utils/theme';

const ACTIVE_STATUSES: WorkflowStatus[] = ['in_progress', 'paused', 'failed', 'ready', 'planning'];

export function StatsSummary(): React.JSX.Element {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);
  const lastRefreshAt = useAppStore((s) => s.lastRefreshAt);
  const agents = useAgents();
  const messages = useAllMessages();

  const wfResult = usePolling(
    () => workflowService.list(db, { limit: 100, status: ACTIVE_STATUSES }),
    pollInterval,
    lastRefreshAt,
  );
  const workflowCount = wfResult.data?.workflows.length ?? 0;
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
