import type { Message } from '@caw/core';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useAllMessages } from '../hooks/useMessages';
import { useAppStore } from '../store';
import { formatRelativeTime } from '../utils/format';
import type { Column } from './SelectableTable';
import { SelectableTable } from './SelectableTable';
import { PriorityIndicator, TypeBadge } from './TypeBadge';

interface MessageRow {
  id: string;
  subject: string | null;
  body: string;
  message_type: string;
  status: string;
  priority: string;
  workflow_id: string | null;
  created_at: number;
}

const messageColumns: Column<MessageRow>[] = [
  {
    id: 'unread-icon',
    key: 'status',
    header: '',
    width: 3,
    render: (val) => <Text color="cyan">{val === 'unread' ? '●' : ' '}</Text>,
  },
  {
    key: 'message_type',
    header: 'Type',
    width: 10,
    render: (val) => <TypeBadge type={String(val)} />,
  },
  {
    key: 'body',
    header: 'Subject',
    width: 35,
    render: (_val, row) => <Text>{row.subject ?? row.body.slice(0, 30)}</Text>,
  },
  {
    key: 'priority',
    header: 'Pri',
    width: 5,
    render: (val) => <PriorityIndicator priority={String(val)} />,
  },
  {
    key: 'created_at',
    header: 'When',
    width: 10,
    render: (val) => <Text dimColor>{formatRelativeTime(val as number)}</Text>,
  },
];

function toRows(messages: Message[]): MessageRow[] {
  return messages.map((m) => ({
    id: m.id,
    subject: m.subject,
    body: m.body,
    message_type: m.message_type,
    status: m.status,
    priority: m.priority,
    workflow_id: m.workflow_id,
    created_at: m.created_at,
  }));
}

export function GlobalMessageList(): React.JSX.Element {
  const { data, error } = useAllMessages();
  const messageStatusFilter = useAppStore((s) => s.messageStatusFilter);
  const promptFocused = useAppStore((s) => s.promptFocused);
  const push = useAppStore((s) => s.push);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allMessages = data?.messages ?? [];
  const totalUnread = data?.totalUnread ?? 0;

  const filtered =
    messageStatusFilter === 'unread'
      ? allMessages.filter((m) => m.status === 'unread')
      : allMessages;
  const rows = toRows(filtered);

  useEffect(() => {
    if (rows.length > 0 && selectedIndex >= rows.length) {
      setSelectedIndex(rows.length - 1);
    }
  }, [rows.length, selectedIndex]);

  if (error) {
    return (
      <Box padding={1}>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  const filterLabel = messageStatusFilter === 'unread' ? 'Unread' : 'All';

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>
        {filterLabel} Messages ({rows.length}){totalUnread > 0 && ` · ${totalUnread} unread`}
      </Text>
      <SelectableTable
        data={rows}
        columns={messageColumns}
        selectedIndex={selectedIndex}
        onSelectIndex={setSelectedIndex}
        onConfirm={(item) => {
          push({ screen: 'message-detail', workflowId: item.workflow_id, messageId: item.id });
        }}
        isFocused={!promptFocused}
        emptyMessage={messageStatusFilter === 'unread' ? 'No unread messages' : 'No messages'}
        maxVisibleRows={15}
      />
    </Box>
  );
}
