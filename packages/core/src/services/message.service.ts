import type { DatabaseType, SQLParam } from '../db/connection';
import type { AgentRole, AgentStatus } from '../types/agent';
import type { Message, MessagePriority, MessageStatus, MessageType } from '../types/message';
import { generateId, messageId } from '../utils/id';

// --- Parameter / Result types ---

export interface SendParams {
  sender_id: string | null;
  recipient_id: string;
  message_type: MessageType;
  body: string;
  subject?: string;
  priority?: MessagePriority;
  workflow_id?: string;
  task_id?: string;
  reply_to_id?: string;
  expires_at?: number;
}

export interface SendResult {
  id: string;
  thread_id: string;
}

export interface BroadcastFilter {
  role?: AgentRole;
  status?: AgentStatus | AgentStatus[];
  runtime?: string;
}

export interface BroadcastParams {
  sender_id: string;
  recipient_filter: BroadcastFilter;
  message_type: MessageType;
  body: string;
  subject?: string;
  priority?: MessagePriority;
  workflow_id?: string;
  expires_at?: number;
}

export interface BroadcastResult {
  sent_count: number;
  message_ids: string[];
}

export interface ListFilters {
  status?: MessageStatus | MessageStatus[];
  message_type?: MessageType | MessageType[];
  priority?: MessagePriority | MessagePriority[];
  thread_id?: string;
  workflow_id?: string;
  since?: number;
  limit?: number;
}

export interface ListAllFilters {
  status?: MessageStatus | MessageStatus[];
  message_type?: MessageType | MessageType[];
  priority?: MessagePriority | MessagePriority[];
  since?: number;
  limit?: number;
}

export interface CountUnreadResult {
  count: number;
  by_priority: Record<string, number>;
}

// --- Service functions ---

export function send(db: DatabaseType, params: SendParams): SendResult {
  // Validate recipient exists
  const recipient = db.prepare('SELECT id FROM agents WHERE id = ?').get(params.recipient_id);
  if (!recipient) {
    throw new Error(`Recipient agent not found: ${params.recipient_id}`);
  }

  // Validate sender if non-null
  if (params.sender_id !== null) {
    const sender = db.prepare('SELECT id FROM agents WHERE id = ?').get(params.sender_id);
    if (!sender) {
      throw new Error(`Sender agent not found: ${params.sender_id}`);
    }
  }

  // Determine thread_id
  let threadId: string;
  if (params.reply_to_id) {
    const parent = db
      .prepare('SELECT thread_id FROM messages WHERE id = ?')
      .get(params.reply_to_id) as { thread_id: string | null } | null;
    if (!parent) {
      throw new Error(`Reply-to message not found: ${params.reply_to_id}`);
    }
    threadId = parent.thread_id ?? generateId('thr');
  } else {
    threadId = generateId('thr');
  }

  const id = messageId();
  const now = Date.now();
  const priority = params.priority ?? 'normal';

  db.prepare(
    `INSERT INTO messages (id, sender_id, recipient_id, message_type, subject, body, priority, status, workflow_id, task_id, reply_to_id, thread_id, created_at, read_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    id,
    params.sender_id,
    params.recipient_id,
    params.message_type,
    params.subject ?? null,
    params.body,
    priority,
    params.workflow_id ?? null,
    params.task_id ?? null,
    params.reply_to_id ?? null,
    threadId,
    now,
    params.expires_at ?? null,
  );

  return { id, thread_id: threadId };
}

export function broadcast(db: DatabaseType, params: BroadcastParams): BroadcastResult {
  const run = db.transaction(() => {
    // Validate sender exists
    const sender = db.prepare('SELECT id FROM agents WHERE id = ?').get(params.sender_id);
    if (!sender) {
      throw new Error(`Sender agent not found: ${params.sender_id}`);
    }

    // Build agent query with filters
    const conditions: string[] = ['id != ?'];
    const queryParams: SQLParam[] = [params.sender_id];

    if (params.recipient_filter.role !== undefined) {
      conditions.push('role = ?');
      queryParams.push(params.recipient_filter.role);
    }

    if (params.recipient_filter.status !== undefined) {
      if (Array.isArray(params.recipient_filter.status)) {
        if (params.recipient_filter.status.length === 0) {
          return { sent_count: 0, message_ids: [] };
        }
        const placeholders = params.recipient_filter.status.map(() => '?').join(', ');
        conditions.push(`status IN (${placeholders})`);
        queryParams.push(...params.recipient_filter.status);
      } else {
        conditions.push('status = ?');
        queryParams.push(params.recipient_filter.status);
      }
    }

    if (params.recipient_filter.runtime !== undefined) {
      conditions.push('runtime = ?');
      queryParams.push(params.recipient_filter.runtime);
    }

    const agents = db
      .prepare(`SELECT id FROM agents WHERE ${conditions.join(' AND ')}`)
      .all(...queryParams) as { id: string }[];

    if (agents.length === 0) {
      return { sent_count: 0, message_ids: [] };
    }

    const threadId = generateId('thr');
    const now = Date.now();
    const priority = params.priority ?? 'normal';
    const messageIds: string[] = [];

    const insert = db.prepare(
      `INSERT INTO messages (id, sender_id, recipient_id, message_type, subject, body, priority, status, workflow_id, task_id, reply_to_id, thread_id, created_at, read_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unread', ?, NULL, NULL, ?, ?, NULL, ?)`,
    );

    for (const agent of agents) {
      const id = messageId();
      insert.run(
        id,
        params.sender_id,
        agent.id,
        params.message_type,
        params.subject ?? null,
        params.body,
        priority,
        params.workflow_id ?? null,
        threadId,
        now,
        params.expires_at ?? null,
      );
      messageIds.push(id);
    }

    return { sent_count: agents.length, message_ids: messageIds };
  });

  return run();
}

export function list(db: DatabaseType, agentId: string, filters?: ListFilters): Message[] {
  const conditions: string[] = ['recipient_id = ?'];
  const params: SQLParam[] = [agentId];

  if (filters?.status !== undefined) {
    if (Array.isArray(filters.status)) {
      if (filters.status.length === 0) {
        return [];
      }
      const placeholders = filters.status.map(() => '?').join(', ');
      conditions.push(`status IN (${placeholders})`);
      params.push(...filters.status);
    } else {
      conditions.push('status = ?');
      params.push(filters.status);
    }
  }

  if (filters?.message_type !== undefined) {
    if (Array.isArray(filters.message_type)) {
      if (filters.message_type.length === 0) {
        return [];
      }
      const placeholders = filters.message_type.map(() => '?').join(', ');
      conditions.push(`message_type IN (${placeholders})`);
      params.push(...filters.message_type);
    } else {
      conditions.push('message_type = ?');
      params.push(filters.message_type);
    }
  }

  if (filters?.priority !== undefined) {
    if (Array.isArray(filters.priority)) {
      if (filters.priority.length === 0) {
        return [];
      }
      const placeholders = filters.priority.map(() => '?').join(', ');
      conditions.push(`priority IN (${placeholders})`);
      params.push(...filters.priority);
    } else {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }
  }

  if (filters?.thread_id !== undefined) {
    conditions.push('thread_id = ?');
    params.push(filters.thread_id);
  }

  if (filters?.workflow_id !== undefined) {
    conditions.push('workflow_id = ?');
    params.push(filters.workflow_id);
  }

  if (filters?.since !== undefined) {
    conditions.push('created_at > ?');
    params.push(filters.since);
  }

  const limit = filters?.limit ?? 20;
  const where = conditions.join(' AND ');
  const sql = `SELECT * FROM messages WHERE ${where} ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params) as Message[];
}

export function get(db: DatabaseType, id: string, markRead = false): Message | null {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | null;

  if (!row) {
    return null;
  }

  if (markRead && row.status === 'unread') {
    const now = Date.now();
    db.prepare("UPDATE messages SET status = 'read', read_at = ? WHERE id = ?").run(now, id);
    return { ...row, status: 'read', read_at: now };
  }

  return row;
}

export function markRead(db: DatabaseType, messageIds: string[]): number {
  if (messageIds.length === 0) {
    return 0;
  }

  const now = Date.now();
  const placeholders = messageIds.map(() => '?').join(', ');
  const result = db
    .prepare(
      `UPDATE messages SET status = 'read', read_at = ? WHERE id IN (${placeholders}) AND status = 'unread'`,
    )
    .run(now, ...messageIds);

  return result.changes;
}

export function archive(db: DatabaseType, messageIds: string[]): number {
  if (messageIds.length === 0) {
    return 0;
  }

  const placeholders = messageIds.map(() => '?').join(', ');
  const result = db
    .prepare(
      `UPDATE messages SET status = 'archived' WHERE id IN (${placeholders}) AND status != 'archived'`,
    )
    .run(...messageIds);

  return result.changes;
}

export function countUnread(
  db: DatabaseType,
  agentId: string,
  priorityFilter?: MessagePriority[],
): CountUnreadResult {
  const conditions: string[] = ['recipient_id = ?', "status = 'unread'"];
  const params: SQLParam[] = [agentId];

  if (priorityFilter && priorityFilter.length > 0) {
    const placeholders = priorityFilter.map(() => '?').join(', ');
    conditions.push(`priority IN (${placeholders})`);
    params.push(...priorityFilter);
  }

  const where = conditions.join(' AND ');

  const { count } = db
    .prepare(`SELECT COUNT(*) as count FROM messages WHERE ${where}`)
    .get(...params) as { count: number };

  const rows = db
    .prepare(`SELECT priority, COUNT(*) as count FROM messages WHERE ${where} GROUP BY priority`)
    .all(...params) as { priority: string; count: number }[];

  const byPriority: Record<string, number> = {};
  for (const row of rows) {
    byPriority[row.priority] = row.count;
  }

  return { count, by_priority: byPriority };
}

export function listAll(db: DatabaseType, filters?: ListAllFilters): Message[] {
  const conditions: string[] = [];
  const params: SQLParam[] = [];

  if (filters?.status !== undefined) {
    if (Array.isArray(filters.status)) {
      if (filters.status.length === 0) {
        return [];
      }
      const placeholders = filters.status.map(() => '?').join(', ');
      conditions.push(`status IN (${placeholders})`);
      params.push(...filters.status);
    } else {
      conditions.push('status = ?');
      params.push(filters.status);
    }
  }

  if (filters?.message_type !== undefined) {
    if (Array.isArray(filters.message_type)) {
      if (filters.message_type.length === 0) {
        return [];
      }
      const placeholders = filters.message_type.map(() => '?').join(', ');
      conditions.push(`message_type IN (${placeholders})`);
      params.push(...filters.message_type);
    } else {
      conditions.push('message_type = ?');
      params.push(filters.message_type);
    }
  }

  if (filters?.priority !== undefined) {
    if (Array.isArray(filters.priority)) {
      if (filters.priority.length === 0) {
        return [];
      }
      const placeholders = filters.priority.map(() => '?').join(', ');
      conditions.push(`priority IN (${placeholders})`);
      params.push(...filters.priority);
    } else {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }
  }

  if (filters?.since !== undefined) {
    conditions.push('created_at > ?');
    params.push(filters.since);
  }

  const limit = filters?.limit ?? 50;
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params) as Message[];
}

export function countAllUnread(db: DatabaseType): number {
  const { count } = db
    .prepare("SELECT COUNT(*) as count FROM messages WHERE status = 'unread'")
    .get() as { count: number };
  return count;
}

export function getThread(db: DatabaseType, threadId: string): Message[] {
  return db
    .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC')
    .all(threadId) as Message[];
}
