import type { Message } from '@caw/core';
import { messageService } from '@caw/core';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { useDb } from '../context/db';
import { useAppStore } from '../store';

interface MessageInboxProps {
  messages: Message[];
  unreadCount: number;
  agentId: string | null;
  isFocused?: boolean;
}

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

function PriorityIndicator({ priority }: { priority: string }): React.JSX.Element | null {
  if (priority === 'urgent') return <Text color="red">!!</Text>;
  if (priority === 'high') return <Text color="yellow">!</Text>;
  if (priority === 'low') return <Text dimColor>·</Text>;
  return null;
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
        setSelectedIndex(0);
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
