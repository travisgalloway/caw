import { messageService } from '@caw/core';
import { Box, Text } from 'ink';
import type React from 'react';
import { useDb } from '../context/db';
import { formatTimestamp } from '../utils/format';
import { THEME } from '../utils/theme';
import { TypeBadge } from './TypeBadge';

interface MessageDetailScreenProps {
  workflowId: string;
  messageId: string;
}

export function MessageDetailScreen({ messageId }: MessageDetailScreenProps): React.JSX.Element {
  const db = useDb();

  let message = null;
  try {
    const all = messageService.listAll(db, { limit: 500 });
    message = all.find((m) => m.id === messageId) ?? null;
  } catch {
    // ignore
  }

  if (!message) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Message not found: {messageId}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={THEME.muted}
        paddingX={2}
        paddingY={1}
        marginX={1}
      >
        <Box gap={1}>
          <TypeBadge type={message.message_type} />
          <Text bold>{message.subject ?? 'No subject'}</Text>
          <Text dimColor>[{message.status}]</Text>
        </Box>

        <Text> </Text>

        <Box gap={1}>
          <Text dimColor>ID:</Text>
          <Text>{message.id}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>From:</Text>
          <Text>{message.sender_id}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>To:</Text>
          <Text>{message.recipient_id}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Priority:</Text>
          <Text>{message.priority}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Created:</Text>
          <Text>{formatTimestamp(message.created_at)}</Text>
        </Box>

        {message.thread_id && (
          <Box gap={1}>
            <Text dimColor>Thread:</Text>
            <Text>{message.thread_id}</Text>
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            Body
          </Text>
          <Text>{message.body}</Text>
        </Box>
      </Box>

      <Box paddingX={1}>
        <Text dimColor>Esc back</Text>
      </Box>
    </Box>
  );
}
