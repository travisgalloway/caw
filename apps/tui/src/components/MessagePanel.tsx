import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { useAllMessages } from '../hooks/useMessages';
import { useAppStore } from '../store';

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function TypeBadge({ type }: { type: string }): React.JSX.Element {
  const badges: Record<string, { label: string; color: string }> = {
    task_assignment: { label: 'TASK', color: 'yellow' },
    status_update: { label: 'STATUS', color: 'blue' },
    query: { label: 'QUERY', color: 'cyan' },
    response: { label: 'REPLY', color: 'green' },
    broadcast: { label: 'BCAST', color: 'magenta' },
  };
  const badge = badges[type] ?? { label: type.toUpperCase(), color: 'white' };
  return <Text color={badge.color}>[{badge.label}]</Text>;
}

export function MessagePanel(): React.JSX.Element {
  const { activePanel, selectAgent, setView } = useAppStore();
  const isFocused = activePanel === 'messages';
  const { data, error } = useAllMessages();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const messages = data?.messages ?? [];

  useInput(
    (_input, key) => {
      if (!messages || messages.length === 0) return;

      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(messages.length - 1, prev + 1));
      } else if (key.return) {
        const msg = messages[selectedIndex];
        if (msg) {
          selectAgent(msg.recipient_id);
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
        <Text bold>Messages</Text>
        {data && data.totalUnread > 0 && <Text color="yellow">({data.totalUnread} unread)</Text>}
      </Box>
      {error ? (
        <Text color="red">Error: {error.message}</Text>
      ) : messages.length === 0 ? (
        <Text dimColor>No messages</Text>
      ) : (
        messages.map((msg, index) => {
          const isSelected = isFocused && index === selectedIndex;
          const truncatedBody = msg.subject ?? msg.body.slice(0, 35);
          const recipientId = msg.recipient_id.slice(0, 10);

          return (
            <Box key={msg.id} gap={1}>
              <TypeBadge type={msg.message_type} />
              <Text inverse={isSelected} bold={isSelected}>
                {truncatedBody}
              </Text>
              <Text dimColor>→{recipientId}</Text>
              <Text dimColor>{formatRelativeTime(msg.created_at)}</Text>
              {msg.status === 'unread' && <Text color="cyan">●</Text>}
            </Box>
          );
        })
      )}
    </Box>
  );
}
