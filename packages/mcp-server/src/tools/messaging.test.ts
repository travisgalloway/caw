import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { agentService, createConnection, runMigrations } from '@caw/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../server';
import type { ToolErrorInfo } from './types';

type ToolHandler = (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;

function getToolHandler(server: unknown, name: string): ToolHandler {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
  const tools = (server as any)._registeredTools as Record<string, { handler: ToolHandler }>;
  return tools[name].handler;
}

function parseContent(result: CallToolResult): unknown {
  const text = result.content[0];
  if (text.type !== 'text') throw new Error('Expected text content');
  return JSON.parse(text.text);
}

function parseError(result: CallToolResult): ToolErrorInfo {
  expect(result.isError).toBe(true);
  return parseContent(result) as ToolErrorInfo;
}

describe('messaging tools', () => {
  let db: DatabaseType;
  let call: (name: string, args: Record<string, unknown>) => CallToolResult;

  function registerAgent(name: string): string {
    const agent = agentService.register(db, {
      name,
      runtime: 'claude_code',
    });
    return agent.id;
  }

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);
    call = (name, args) => {
      const handler = getToolHandler(server, name);
      return handler(args) as CallToolResult;
    };
  });

  // --- message_send ---

  describe('message_send', () => {
    it('sends a message between agents', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      const result = call('message_send', {
        sender_id: sender,
        recipient_id: recipient,
        message_type: 'query',
        body: 'Hello!',
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string };
      expect(data.id).toMatch(/^msg_/);
    });

    it('sends a message with object body', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      const result = call('message_send', {
        sender_id: sender,
        recipient_id: recipient,
        message_type: 'status_update',
        body: { progress: 50 },
      });
      expect(result.isError).toBeUndefined();
    });

    it('returns RECIPIENT_NOT_FOUND for missing recipient', () => {
      const sender = registerAgent('Sender');
      const result = call('message_send', {
        sender_id: sender,
        recipient_id: 'ag_nonexistent',
        message_type: 'query',
        body: 'Hello',
      });
      const err = parseError(result);
      expect(err.code).toBe('RECIPIENT_NOT_FOUND');
      expect(err.recoverable).toBe(false);
    });

    it('returns SENDER_NOT_FOUND for missing sender', () => {
      const recipient = registerAgent('Recipient');
      const result = call('message_send', {
        sender_id: 'ag_nonexistent',
        recipient_id: recipient,
        message_type: 'query',
        body: 'Hello',
      });
      const err = parseError(result);
      expect(err.code).toBe('SENDER_NOT_FOUND');
    });

    it('returns MESSAGE_NOT_FOUND for invalid reply_to_id', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      const result = call('message_send', {
        sender_id: sender,
        recipient_id: recipient,
        message_type: 'response',
        body: 'Reply',
        reply_to_id: 'msg_nonexistent',
      });
      const err = parseError(result);
      expect(err.code).toBe('MESSAGE_NOT_FOUND');
    });
  });

  // --- message_broadcast ---

  describe('message_broadcast', () => {
    it('broadcasts a message to agents', () => {
      const sender = registerAgent('Broadcaster');
      registerAgent('Worker 1');
      registerAgent('Worker 2');

      const result = call('message_broadcast', {
        sender_id: sender,
        message_type: 'broadcast',
        body: 'Update for everyone',
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { sent_count: number };
      expect(data.sent_count).toBeGreaterThanOrEqual(0);
    });

    it('returns SENDER_NOT_FOUND for missing sender', () => {
      const result = call('message_broadcast', {
        sender_id: 'ag_nonexistent',
        message_type: 'broadcast',
        body: 'Hello',
      });
      const err = parseError(result);
      expect(err.code).toBe('SENDER_NOT_FOUND');
    });
  });

  // --- message_get ---

  describe('message_get', () => {
    it('returns a specific message', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      const sent = parseContent(
        call('message_send', {
          sender_id: sender,
          recipient_id: recipient,
          message_type: 'query',
          subject: 'Test Subject',
          body: 'Hello',
        }),
      ) as { id: string };

      const result = call('message_get', { id: sent.id });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string; subject: string };
      expect(data.id).toBe(sent.id);
      expect(data.subject).toBe('Test Subject');
    });

    it('returns MESSAGE_NOT_FOUND for missing message', () => {
      const result = call('message_get', { id: 'msg_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('MESSAGE_NOT_FOUND');
      expect(err.recoverable).toBe(false);
    });
  });

  // --- message_list ---

  describe('message_list', () => {
    it('returns messages for an agent', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      call('message_send', {
        sender_id: sender,
        recipient_id: recipient,
        message_type: 'query',
        body: 'Hello',
      });

      const result = call('message_list', { agent_id: recipient });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as {
        messages: unknown[];
        unread_count: number;
      };
      expect(data.messages).toHaveLength(1);
      expect(data.unread_count).toBe(1);
    });

    it('returns empty inbox for agent with no messages', () => {
      const agent = registerAgent('Lonely Agent');
      const result = call('message_list', { agent_id: agent });
      const data = parseContent(result) as { messages: unknown[]; unread_count: number };
      expect(data.messages).toEqual([]);
      expect(data.unread_count).toBe(0);
    });
  });

  // --- message_mark_read ---

  describe('message_mark_read', () => {
    it('marks messages as read', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      const sent = parseContent(
        call('message_send', {
          sender_id: sender,
          recipient_id: recipient,
          message_type: 'query',
          body: 'Hello',
        }),
      ) as { id: string };

      const result = call('message_mark_read', { message_ids: [sent.id] });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });
  });

  // --- message_archive ---

  describe('message_archive', () => {
    it('archives messages', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      const sent = parseContent(
        call('message_send', {
          sender_id: sender,
          recipient_id: recipient,
          message_type: 'query',
          body: 'Hello',
        }),
      ) as { id: string };

      const result = call('message_archive', { message_ids: [sent.id] });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });
  });

  // --- message_broadcast edge cases ---

  describe('message_broadcast edge cases', () => {
    it('returns zero sent_count when no agents match recipient_filter', () => {
      const sender = registerAgent('Broadcaster');
      // Another agent exists but does not match the recipient_filter
      registerAgent('NonMatching');

      const result = call('message_broadcast', {
        sender_id: sender,
        message_type: 'broadcast',
        body: 'Echo',
        recipient_filter: { role: 'coordinator' },
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { sent_count: number };
      expect(data.sent_count).toBe(0);
    });
  });

  // --- message_get edge cases ---

  describe('message_get edge cases', () => {
    it('message stays unread when mark_read is false', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      const sent = parseContent(
        call('message_send', {
          sender_id: sender,
          recipient_id: recipient,
          message_type: 'query',
          body: 'Stay-unread test',
        }),
      ) as { id: string };

      // Get with mark_read: false — should NOT mark as read
      call('message_get', { id: sent.id, mark_read: false });

      // Unread count should still be 1
      const countResult = call('message_count_unread', { agent_id: recipient });
      const countData = parseContent(countResult) as { count: number };
      expect(countData.count).toBe(1);
    });

    it('auto-marks as read when mark_read is true', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      const sent = parseContent(
        call('message_send', {
          sender_id: sender,
          recipient_id: recipient,
          message_type: 'query',
          body: 'Auto-read test',
        }),
      ) as { id: string };

      // Confirm starts unread
      const before = parseContent(call('message_count_unread', { agent_id: recipient })) as {
        count: number;
      };
      expect(before.count).toBe(1);

      // Get with mark_read: true
      call('message_get', { id: sent.id, mark_read: true });

      // Now unread count should be 0
      const after = parseContent(call('message_count_unread', { agent_id: recipient })) as {
        count: number;
      };
      expect(after.count).toBe(0);
    });
  });

  // --- message_count_unread ---

  describe('message_count_unread', () => {
    it('returns unread count', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      call('message_send', {
        sender_id: sender,
        recipient_id: recipient,
        message_type: 'query',
        body: 'Hello',
      });

      const result = call('message_count_unread', { agent_id: recipient });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { count: number };
      expect(data.count).toBe(1);
    });

    it('returns breakdown by priority', () => {
      const sender = registerAgent('Sender');
      const recipient = registerAgent('Recipient');

      call('message_send', {
        sender_id: sender,
        recipient_id: recipient,
        message_type: 'query',
        body: 'Normal msg',
        priority: 'normal',
      });

      call('message_send', {
        sender_id: sender,
        recipient_id: recipient,
        message_type: 'query',
        body: 'Urgent msg',
        priority: 'high',
      });

      const result = call('message_count_unread', { agent_id: recipient });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { count: number; by_priority: Record<string, number> };
      expect(data.count).toBe(2);
      expect(data.by_priority).toEqual({ normal: 1, high: 1 });
    });
  });

  // --- structured error format ---

  describe('structured error format', () => {
    it('includes all required fields in error responses', () => {
      const result = call('message_get', { id: 'msg_missing' });
      expect(result.isError).toBe(true);

      const err = parseContent(result) as ToolErrorInfo;
      expect(err).toHaveProperty('code');
      expect(err).toHaveProperty('message');
      expect(err).toHaveProperty('recoverable');
      expect(err).toHaveProperty('suggestion');
      expect(typeof err.code).toBe('string');
      expect(typeof err.message).toBe('string');
      expect(typeof err.recoverable).toBe('boolean');
      expect(typeof err.suggestion).toBe('string');
    });
  });
});
