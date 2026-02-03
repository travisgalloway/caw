import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Agent } from '../types/agent';
import * as agentService from './agent.service';
import * as messageService from './message.service';
import * as workflowService from './workflow.service';

function registerAgent(
  db: DatabaseType,
  name: string,
  opts?: { role?: 'coordinator' | 'worker'; runtime?: string },
): Agent {
  return agentService.register(db, {
    name,
    runtime: opts?.runtime ?? 'claude_code',
    role: opts?.role,
  });
}

describe('messageService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- send ---

  describe('send', () => {
    it('creates a message with ID format', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const result = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      expect(result.id).toMatch(/^msg_[0-9a-z]{12}$/);
      expect(result.thread_id).toMatch(/^thr_[0-9a-z]{12}$/);
    });

    it('generates a new thread_id for non-reply messages', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      const r2 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'World',
      });

      expect(r1.thread_id).not.toBe(r2.thread_id);
    });

    it('inherits thread_id from parent when replying', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const original = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Question?',
      });

      const reply = messageService.send(db, {
        sender_id: recipient.id,
        recipient_id: sender.id,
        message_type: 'response',
        body: 'Answer!',
        reply_to_id: original.id,
      });

      expect(reply.thread_id).toBe(original.thread_id);
    });

    it('uses default priority of normal', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const result = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      const msg = messageService.get(db, result.id);
      expect(msg?.priority).toBe('normal');
    });

    it('allows null sender (system message)', () => {
      const recipient = registerAgent(db, 'recipient');

      const result = messageService.send(db, {
        sender_id: null,
        recipient_id: recipient.id,
        message_type: 'status_update',
        body: 'System notification',
      });

      const msg = messageService.get(db, result.id);
      expect(msg?.sender_id).toBeNull();
    });

    it('stores optional fields', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      // Create real workflow + task for FK constraints
      const wf = workflowService.create(db, { name: 'WF', source_type: 'issue' });
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'Task' }] });
      const tasks = db.prepare('SELECT id FROM tasks WHERE workflow_id = ?').all(wf.id) as {
        id: string;
      }[];

      const result = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'task_assignment',
        body: 'Do this',
        subject: 'Assignment',
        priority: 'urgent',
        workflow_id: wf.id,
        task_id: tasks[0].id,
        expires_at: Date.now() + 60000,
      });

      const msg = messageService.get(db, result.id);
      expect(msg?.subject).toBe('Assignment');
      expect(msg?.priority).toBe('urgent');
      expect(msg?.workflow_id).toBe(wf.id);
      expect(msg?.task_id).toBe(tasks[0].id);
      expect(msg?.expires_at).toBeGreaterThan(0);
    });

    it('throws when recipient not found', () => {
      const sender = registerAgent(db, 'sender');

      expect(() =>
        messageService.send(db, {
          sender_id: sender.id,
          recipient_id: 'ag_nonexistent',
          message_type: 'query',
          body: 'Hello',
        }),
      ).toThrow('Recipient agent not found');
    });

    it('throws when sender not found', () => {
      const recipient = registerAgent(db, 'recipient');

      expect(() =>
        messageService.send(db, {
          sender_id: 'ag_nonexistent',
          recipient_id: recipient.id,
          message_type: 'query',
          body: 'Hello',
        }),
      ).toThrow('Sender agent not found');
    });

    it('throws when reply_to message not found', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      expect(() =>
        messageService.send(db, {
          sender_id: sender.id,
          recipient_id: recipient.id,
          message_type: 'response',
          body: 'Reply',
          reply_to_id: 'msg_nonexistent',
        }),
      ).toThrow('Reply-to message not found');
    });
  });

  // --- broadcast ---

  describe('broadcast', () => {
    it('sends to matching agents', () => {
      const sender = registerAgent(db, 'sender');
      registerAgent(db, 'worker-1');
      registerAgent(db, 'worker-2');

      const result = messageService.broadcast(db, {
        sender_id: sender.id,
        recipient_filter: { status: 'online' },
        message_type: 'broadcast',
        body: 'Attention everyone',
      });

      expect(result.sent_count).toBe(2);
      expect(result.message_ids).toHaveLength(2);
    });

    it('excludes sender from recipients', () => {
      const sender = registerAgent(db, 'sender');
      registerAgent(db, 'worker-1');

      const result = messageService.broadcast(db, {
        sender_id: sender.id,
        recipient_filter: { status: 'online' },
        message_type: 'broadcast',
        body: 'Hello',
      });

      expect(result.sent_count).toBe(1);
    });

    it('filters by role', () => {
      const sender = registerAgent(db, 'sender', { role: 'coordinator' });
      registerAgent(db, 'worker-1', { role: 'worker' });
      registerAgent(db, 'worker-2', { role: 'worker' });
      registerAgent(db, 'coord-2', { role: 'coordinator' });

      const result = messageService.broadcast(db, {
        sender_id: sender.id,
        recipient_filter: { role: 'worker' },
        message_type: 'broadcast',
        body: 'Workers only',
      });

      expect(result.sent_count).toBe(2);
    });

    it('filters by runtime', () => {
      const sender = registerAgent(db, 'sender');
      registerAgent(db, 'cc-worker', { runtime: 'claude_code' });
      registerAgent(db, 'codex-worker', { runtime: 'codex' });

      const result = messageService.broadcast(db, {
        sender_id: sender.id,
        recipient_filter: { runtime: 'codex' },
        message_type: 'broadcast',
        body: 'Codex only',
      });

      expect(result.sent_count).toBe(1);
    });

    it('returns empty result when no agents match', () => {
      const sender = registerAgent(db, 'sender');

      const result = messageService.broadcast(db, {
        sender_id: sender.id,
        recipient_filter: { runtime: 'nonexistent_runtime' },
        message_type: 'broadcast',
        body: 'Hello?',
      });

      expect(result.sent_count).toBe(0);
      expect(result.message_ids).toEqual([]);
    });

    it('uses shared thread_id for all messages', () => {
      const sender = registerAgent(db, 'sender');
      registerAgent(db, 'worker-1');
      registerAgent(db, 'worker-2');

      const result = messageService.broadcast(db, {
        sender_id: sender.id,
        recipient_filter: { status: 'online' },
        message_type: 'broadcast',
        body: 'Shared thread',
      });

      const msg1 = messageService.get(db, result.message_ids[0]);
      const msg2 = messageService.get(db, result.message_ids[1]);
      expect(msg1?.thread_id).toBe(msg2?.thread_id);
    });

    it('filters by array of statuses', () => {
      const sender = registerAgent(db, 'sender');
      registerAgent(db, 'a');
      const b = registerAgent(db, 'b');
      agentService.update(db, b.id, { status: 'busy' });

      const result = messageService.broadcast(db, {
        sender_id: sender.id,
        recipient_filter: { status: ['online', 'busy'] },
        message_type: 'broadcast',
        body: 'Active agents',
      });

      expect(result.sent_count).toBe(2);
    });

    it('returns empty when status filter is empty array', () => {
      const sender = registerAgent(db, 'sender');
      registerAgent(db, 'worker-1');

      const result = messageService.broadcast(db, {
        sender_id: sender.id,
        recipient_filter: { status: [] },
        message_type: 'broadcast',
        body: 'Hello',
      });

      expect(result.sent_count).toBe(0);
      expect(result.message_ids).toEqual([]);
    });

    it('throws when sender not found', () => {
      expect(() =>
        messageService.broadcast(db, {
          sender_id: 'ag_nonexistent',
          recipient_filter: { status: 'online' },
          message_type: 'broadcast',
          body: 'Hello',
        }),
      ).toThrow('Sender agent not found');
    });
  });

  // --- list ---

  describe('list', () => {
    it('returns messages for a specific agent', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');
      const other = registerAgent(db, 'other');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'For recipient',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: other.id,
        message_type: 'query',
        body: 'For other',
      });

      const messages = messageService.list(db, recipient.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('For recipient');
    });

    it('filters by status', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Message 1',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Message 2',
      });

      messageService.markRead(db, [r1.id]);

      const unread = messageService.list(db, recipient.id, { status: 'unread' });
      expect(unread).toHaveLength(1);
      expect(unread[0].body).toBe('Message 2');
    });

    it('filters by message_type', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Question',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'status_update',
        body: 'Update',
      });

      const queries = messageService.list(db, recipient.id, { message_type: 'query' });
      expect(queries).toHaveLength(1);
      expect(queries[0].body).toBe('Question');
    });

    it('filters by priority', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Normal',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Urgent',
        priority: 'urgent',
      });

      const urgent = messageService.list(db, recipient.id, { priority: 'urgent' });
      expect(urgent).toHaveLength(1);
      expect(urgent[0].body).toBe('Urgent');
    });

    it('filters by thread_id', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Thread 1',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Thread 2',
      });

      const thread = messageService.list(db, recipient.id, { thread_id: r1.thread_id });
      expect(thread).toHaveLength(1);
      expect(thread[0].body).toBe('Thread 1');
    });

    it('filters by workflow_id', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const wf1 = workflowService.create(db, { name: 'WF1', source_type: 'issue' });
      const wf2 = workflowService.create(db, { name: 'WF2', source_type: 'issue' });

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'WF1',
        workflow_id: wf1.id,
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'WF2',
        workflow_id: wf2.id,
      });

      const result = messageService.list(db, recipient.id, { workflow_id: wf1.id });
      expect(result).toHaveLength(1);
      expect(result[0].body).toBe('WF1');
    });

    it('filters by since timestamp', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      // Insert with explicit timestamps to avoid same-millisecond issues
      const baseTime = Date.now() - 2000;

      db.prepare(
        `INSERT INTO messages (id, sender_id, recipient_id, message_type, body, priority, status, thread_id, created_at)
         VALUES ('msg_old000000001', ?, ?, 'query', 'Old message', 'normal', 'unread', 'thr_000000000001', ?)`,
      ).run(sender.id, recipient.id, baseTime);

      db.prepare(
        `INSERT INTO messages (id, sender_id, recipient_id, message_type, body, priority, status, thread_id, created_at)
         VALUES ('msg_new000000001', ?, ?, 'query', 'New message', 'normal', 'unread', 'thr_000000000002', ?)`,
      ).run(sender.id, recipient.id, baseTime + 1000);

      const recent = messageService.list(db, recipient.id, { since: baseTime });
      expect(recent).toHaveLength(1);
      expect(recent[0].body).toBe('New message');
    });

    it('uses default limit of 20', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      for (let i = 0; i < 25; i++) {
        messageService.send(db, {
          sender_id: sender.id,
          recipient_id: recipient.id,
          message_type: 'query',
          body: `Message ${i}`,
        });
      }

      const messages = messageService.list(db, recipient.id);
      expect(messages).toHaveLength(20);
    });

    it('respects custom limit', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      for (let i = 0; i < 10; i++) {
        messageService.send(db, {
          sender_id: sender.id,
          recipient_id: recipient.id,
          message_type: 'query',
          body: `Message ${i}`,
        });
      }

      const messages = messageService.list(db, recipient.id, { limit: 3 });
      expect(messages).toHaveLength(3);
    });

    it('orders by created_at DESC', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      // Insert with explicit timestamps to guarantee ordering
      const baseTime = Date.now() - 2000;

      db.prepare(
        `INSERT INTO messages (id, sender_id, recipient_id, message_type, body, priority, status, thread_id, created_at)
         VALUES ('msg_first0000001', ?, ?, 'query', 'First', 'normal', 'unread', 'thr_000000000003', ?)`,
      ).run(sender.id, recipient.id, baseTime);

      db.prepare(
        `INSERT INTO messages (id, sender_id, recipient_id, message_type, body, priority, status, thread_id, created_at)
         VALUES ('msg_second000001', ?, ?, 'query', 'Second', 'normal', 'unread', 'thr_000000000004', ?)`,
      ).run(sender.id, recipient.id, baseTime + 1000);

      const messages = messageService.list(db, recipient.id);
      expect(messages[0].body).toBe('Second');
      expect(messages[1].body).toBe('First');
    });

    it('returns empty array when status filter is empty array', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      const result = messageService.list(db, recipient.id, { status: [] });
      expect(result).toEqual([]);
    });

    it('returns empty array when message_type filter is empty array', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      const result = messageService.list(db, recipient.id, { message_type: [] });
      expect(result).toEqual([]);
    });

    it('returns empty array when priority filter is empty array', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      const result = messageService.list(db, recipient.id, { priority: [] });
      expect(result).toEqual([]);
    });

    it('supports array filters for status', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Unread',
      });
      const r2 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Read',
      });
      const r3 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Archived',
      });

      messageService.markRead(db, [r2.id]);
      messageService.archive(db, [r3.id]);

      const result = messageService.list(db, recipient.id, { status: ['unread', 'read'] });
      expect(result).toHaveLength(2);
    });
  });

  // --- get ---

  describe('get', () => {
    it('returns message when found', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const result = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      const msg = messageService.get(db, result.id);
      expect(msg).not.toBeNull();
      expect(msg?.body).toBe('Hello');
      expect(msg?.status).toBe('unread');
    });

    it('returns null when not found', () => {
      const msg = messageService.get(db, 'msg_nonexistent');
      expect(msg).toBeNull();
    });

    it('does not mark as read by default', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const result = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      messageService.get(db, result.id);
      const msg = messageService.get(db, result.id);
      expect(msg?.status).toBe('unread');
      expect(msg?.read_at).toBeNull();
    });

    it('marks as read when markRead is true', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const result = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      const msg = messageService.get(db, result.id, true);
      expect(msg?.status).toBe('read');
      expect(msg?.read_at).toBeGreaterThan(0);
    });

    it('sets read_at timestamp when marking as read', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const result = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      const before = Date.now();
      const msg = messageService.get(db, result.id, true);
      expect(msg?.read_at).toBeGreaterThanOrEqual(before);
    });

    it('does not re-mark already-read messages', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const result = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      const firstRead = messageService.get(db, result.id, true);
      const secondRead = messageService.get(db, result.id, true);
      expect(secondRead?.read_at).toBe(firstRead?.read_at);
    });
  });

  // --- markRead ---

  describe('markRead', () => {
    it('marks unread messages as read', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello 1',
      });
      const r2 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello 2',
      });

      const count = messageService.markRead(db, [r1.id, r2.id]);
      expect(count).toBe(2);

      const msg1 = messageService.get(db, r1.id);
      const msg2 = messageService.get(db, r2.id);
      expect(msg1?.status).toBe('read');
      expect(msg2?.status).toBe('read');
    });

    it('skips already-read messages', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      messageService.markRead(db, [r1.id]);
      const count = messageService.markRead(db, [r1.id]);
      expect(count).toBe(0);
    });

    it('returns 0 for empty array', () => {
      const count = messageService.markRead(db, []);
      expect(count).toBe(0);
    });

    it('returns count of actually updated messages', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello 1',
      });
      const r2 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello 2',
      });

      messageService.markRead(db, [r1.id]);
      const count = messageService.markRead(db, [r1.id, r2.id]);
      expect(count).toBe(1);
    });
  });

  // --- archive ---

  describe('archive', () => {
    it('archives messages', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello 1',
      });

      const count = messageService.archive(db, [r1.id]);
      expect(count).toBe(1);

      const msg = messageService.get(db, r1.id);
      expect(msg?.status).toBe('archived');
    });

    it('skips already-archived messages', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      messageService.archive(db, [r1.id]);
      const count = messageService.archive(db, [r1.id]);
      expect(count).toBe(0);
    });

    it('returns 0 for empty array', () => {
      const count = messageService.archive(db, []);
      expect(count).toBe(0);
    });

    it('archives read messages', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });

      messageService.markRead(db, [r1.id]);
      const count = messageService.archive(db, [r1.id]);
      expect(count).toBe(1);

      const msg = messageService.get(db, r1.id);
      expect(msg?.status).toBe('archived');
    });
  });

  // --- countUnread ---

  describe('countUnread', () => {
    it('returns total count and breakdown by priority', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Normal 1',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Normal 2',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Urgent',
        priority: 'urgent',
      });

      const result = messageService.countUnread(db, recipient.id);
      expect(result.count).toBe(3);
      expect(result.by_priority.normal).toBe(2);
      expect(result.by_priority.urgent).toBe(1);
    });

    it('returns 0 when no unread messages', () => {
      const recipient = registerAgent(db, 'recipient');

      const result = messageService.countUnread(db, recipient.id);
      expect(result.count).toBe(0);
      expect(result.by_priority).toEqual({});
    });

    it('excludes read messages', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      const r1 = messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Hello',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'World',
      });

      messageService.markRead(db, [r1.id]);

      const result = messageService.countUnread(db, recipient.id);
      expect(result.count).toBe(1);
    });

    it('filters by priority', () => {
      const sender = registerAgent(db, 'sender');
      const recipient = registerAgent(db, 'recipient');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Normal',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'High',
        priority: 'high',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_type: 'query',
        body: 'Urgent',
        priority: 'urgent',
      });

      const result = messageService.countUnread(db, recipient.id, ['high', 'urgent']);
      expect(result.count).toBe(2);
      expect(result.by_priority.high).toBe(1);
      expect(result.by_priority.urgent).toBe(1);
      expect(result.by_priority.normal).toBeUndefined();
    });

    it('only counts messages for the specified agent', () => {
      const sender = registerAgent(db, 'sender');
      const r1 = registerAgent(db, 'recipient1');
      const r2 = registerAgent(db, 'recipient2');

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: r1.id,
        message_type: 'query',
        body: 'For r1',
      });
      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: r2.id,
        message_type: 'query',
        body: 'For r2',
      });

      const result = messageService.countUnread(db, r1.id);
      expect(result.count).toBe(1);
    });
  });
});
