import type { MessagePriority, MessageStatus, MessageType } from '@caw/core';
import { messageService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall, ToolCallError } from './types';

function toToolCallError(err: unknown): never {
  if (err instanceof ToolCallError) throw err;
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('Recipient agent not found')) {
    throw new ToolCallError({
      code: 'RECIPIENT_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the recipient agent ID and try again',
    });
  }
  if (msg.includes('Sender agent not found')) {
    throw new ToolCallError({
      code: 'SENDER_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the sender agent ID and try again',
    });
  }
  if (msg.includes('Reply-to message not found')) {
    throw new ToolCallError({
      code: 'MESSAGE_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the reply_to_id and try again',
    });
  }

  throw err;
}

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'message_send',
    {
      description: 'Send a message to another agent',
      inputSchema: {
        sender_id: z.string().describe('Sender agent ID'),
        recipient_id: z.string().describe('Recipient agent ID'),
        message_type: z
          .enum(['task_assignment', 'status_update', 'query', 'response', 'broadcast'])
          .describe('Message type'),
        subject: z.string().optional().describe('Message subject'),
        body: z
          .union([z.string(), z.record(z.unknown())])
          .describe('Message body (string or object)'),
        priority: z
          .enum(['low', 'normal', 'high', 'urgent'])
          .optional()
          .describe('Priority, default normal'),
        workflow_id: z.string().optional().describe('Related workflow'),
        task_id: z.string().optional().describe('Related task'),
        reply_to_id: z.string().optional().describe('For threaded replies'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          const body = typeof args.body === 'object' ? JSON.stringify(args.body) : args.body;
          return messageService.send(db, {
            sender_id: args.sender_id,
            recipient_id: args.recipient_id,
            message_type: args.message_type as MessageType,
            subject: args.subject,
            body,
            priority: args.priority as MessagePriority | undefined,
            workflow_id: args.workflow_id,
            task_id: args.task_id,
            reply_to_id: args.reply_to_id,
          });
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'message_broadcast',
    {
      description: 'Broadcast a message to multiple agents',
      inputSchema: {
        sender_id: z.string().describe('Sender agent ID'),
        recipient_filter: z
          .object({
            role: z.enum(['coordinator', 'worker']).optional(),
            status: z.union([z.string(), z.array(z.string())]).optional(),
            runtime: z.string().optional(),
          })
          .optional()
          .describe('Filter recipients'),
        message_type: z.enum(['broadcast', 'status_update']).describe('Message type'),
        subject: z.string().optional().describe('Message subject'),
        body: z.union([z.string(), z.record(z.unknown())]).describe('Message body'),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        workflow_id: z.string().optional(),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          const body = typeof args.body === 'object' ? JSON.stringify(args.body) : args.body;
          return messageService.broadcast(db, {
            sender_id: args.sender_id,
            recipient_filter: args.recipient_filter ?? {},
            message_type: args.message_type as MessageType,
            subject: args.subject,
            body,
            priority: args.priority as MessagePriority | undefined,
            workflow_id: args.workflow_id,
          });
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );

  defineTool(
    server,
    'message_list',
    {
      description: 'Get messages for an agent (inbox)',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        status: z
          .enum(['unread', 'read', 'archived'])
          .optional()
          .describe("Filter by status, default 'unread'"),
        message_type: z.array(z.string()).optional().describe('Filter by message type'),
        priority: z.array(z.string()).optional().describe('Filter by priority'),
        workflow_id: z.string().optional().describe('Filter by workflow'),
        thread_id: z.string().optional().describe('Get all messages in a thread'),
        limit: z.number().int().optional().describe('Max results, default 20'),
        since: z.number().optional().describe('Unix timestamp filter'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const messages = messageService.list(db, args.agent_id, {
          status: args.status as MessageStatus | undefined,
          message_type: args.message_type as MessageType[] | undefined,
          priority: args.priority as MessagePriority[] | undefined,
          workflow_id: args.workflow_id,
          thread_id: args.thread_id,
          limit: args.limit,
          since: args.since,
        });
        const unreadCount = messageService.countUnread(db, args.agent_id);
        return { messages, unread_count: unreadCount.count };
      }),
  );

  defineTool(
    server,
    'message_get',
    {
      description: 'Get a specific message',
      inputSchema: {
        id: z.string().describe('Message ID'),
        mark_read: z.boolean().optional().describe('Mark as read, default true'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const message = messageService.get(db, args.id, args.mark_read ?? true);
        if (!message) {
          throw new ToolCallError({
            code: 'MESSAGE_NOT_FOUND',
            message: `Message not found: ${args.id}`,
            recoverable: false,
            suggestion: 'Check the message ID and try again',
          });
        }
        return message;
      }),
  );

  defineTool(
    server,
    'message_mark_read',
    {
      description: 'Mark messages as read',
      inputSchema: {
        message_ids: z.array(z.string()).describe('Message IDs to mark read'),
      },
    },
    (args) =>
      handleToolCall(() => {
        messageService.markRead(db, args.message_ids);
        return { success: true };
      }),
  );

  defineTool(
    server,
    'message_archive',
    {
      description: 'Archive messages',
      inputSchema: {
        message_ids: z.array(z.string()).describe('Message IDs to archive'),
      },
    },
    (args) =>
      handleToolCall(() => {
        messageService.archive(db, args.message_ids);
        return { success: true };
      }),
  );

  defineTool(
    server,
    'message_count_unread',
    {
      description: 'Get unread message count',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        priority: z.array(z.string()).optional().describe('Filter by priority'),
      },
    },
    (args) =>
      handleToolCall(() => {
        return messageService.countUnread(
          db,
          args.agent_id,
          args.priority as MessagePriority[] | undefined,
        );
      }),
  );
};
