import type { Message } from '@caw/core';
import { messageService } from '@caw/core';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useRef, useState } from 'react';
import { useDb } from '../context/db';
import { useAppStore } from '../store';
import { formatRelativeTime } from '../utils/format';
import { PriorityIndicator, TypeBadge } from './TypeBadge';

interface MessageInboxProps {
  messages: Message[];
  unreadCount: number;
  agentId: string | null;
  isFocused?: boolean;
}

export function MessageInbox({
  messages,
  unreadCount,
  agentId,
  isFocused = false,
}: MessageInboxProps): React.JSX.Element {
  const db = useDb();
  const { messageStatusFilter, setMessageStatusFilter } = useAppStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);

  const filteredMessages =
    messageStatusFilter === 'unread' ? messages.filter((m) => m.status === 'unread') : messages;

  // Reset selection when the list changes
  const prevLenRef = useRef(filteredMessages.length);
  const prevFilterRef = useRef(messageStatusFilter);
  if (
    filteredMessages.length !== prevLenRef.current ||
    messageStatusFilter !== prevFilterRef.current
  ) {
    prevLenRef.current = filteredMessages.length;
    prevFilterRef.current = messageStatusFilter;
    setSelectedIndex(0);
  }

  useInput(
    (input, key) => {
      if (!filteredMessages || filteredMessages.length === 0) return;

      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(filteredMessages.length - 1, prev + 1));
      } else if (key.return) {
        const msg = filteredMessages[selectedIndex];
        if (msg?.thread_id) {
          if (expandedThreadId === msg.thread_id) {
            setExpandedThreadId(null);
            setThreadMessages([]);
          } else {
            setExpandedThreadId(msg.thread_id);
            setThreadMessages(messageService.getThread(db, msg.thread_id));
          }
        }
      } else if (input === 'u') {
        setMessageStatusFilter(messageStatusFilter === 'unread' ? 'all' : 'unread');
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Box gap={1}>
        <Text bold>Messages</Text>
        {unreadCount > 0 && <Text color="yellow">({unreadCount} unread)</Text>}
        {messageStatusFilter === 'unread' && <Text dimColor>[filter: unread]</Text>}
      </Box>
      {!agentId ? (
        <Text dimColor>No agent selected</Text>
      ) : filteredMessages.length === 0 ? (
        <Text dimColor>No messages</Text>
      ) : (
        filteredMessages.map((msg, index) => {
          const isSelected = isFocused && index === selectedIndex;
          const truncatedBody = msg.subject ?? msg.body.slice(0, 40);
          const isExpanded = expandedThreadId === msg.thread_id;

          return (
            <Box key={msg.id} flexDirection="column">
              <Box gap={1}>
                <PriorityIndicator priority={msg.priority} />
                <TypeBadge type={msg.message_type} />
                <Text inverse={isSelected} bold={isSelected}>
                  {truncatedBody}
                </Text>
                <Text dimColor>{formatRelativeTime(msg.created_at)}</Text>
                {msg.status === 'unread' && <Text color="cyan">●</Text>}
              </Box>
              {isExpanded &&
                threadMessages.map((tm) => (
                  <Box key={tm.id} gap={1} marginLeft={2}>
                    <Text dimColor>↳</Text>
                    <TypeBadge type={tm.message_type} />
                    <Text dimColor>{tm.body.slice(0, 50)}</Text>
                    <Text dimColor>{formatRelativeTime(tm.created_at)}</Text>
                  </Box>
                ))}
            </Box>
          );
        })
      )}
      {isFocused && <Text dimColor>↑↓ navigate | Enter expand thread | u toggle unread</Text>}
    </Box>
  );
}
