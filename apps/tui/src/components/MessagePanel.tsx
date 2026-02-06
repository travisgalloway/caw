import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useRef, useState } from 'react';
import { useAllMessages } from '../hooks/useMessages';
import { useAppStore } from '../store';
import { formatRelativeTime } from '../utils/format';
import { TypeBadge } from './TypeBadge';

export function MessagePanel(): React.JSX.Element {
  const { activePanel, selectAgent, setView } = useAppStore();
  const isFocused = activePanel === 'messages';
  const { data, error } = useAllMessages();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const messages = data?.messages ?? [];

  // Reset selection when the list changes
  const prevLenRef = useRef(messages.length);
  if (messages.length !== prevLenRef.current) {
    prevLenRef.current = messages.length;
    setSelectedIndex(0);
  }

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
