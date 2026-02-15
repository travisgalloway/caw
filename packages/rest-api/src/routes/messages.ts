import type { DatabaseType, MessagePriority, MessageStatus, MessageType } from '@caw/core';
import { messageService } from '@caw/core';
import { badRequest, created, getSearchParams, notFound, ok, parseBody } from '../response';
import type { Router } from '../router';
import type { Broadcaster } from '../ws/broadcaster';

export function registerMessageRoutes(router: Router, db: DatabaseType, broadcaster?: Broadcaster) {
  // List messages for an agent
  router.get('/api/agents/:id/messages', (req, params) => {
    const sp = getSearchParams(req);
    const status = sp.get('status') as MessageStatus | null;
    const messageType = sp.get('message_type') as MessageType | null;
    const priority = sp.get('priority') as MessagePriority | null;
    const workflowId = sp.get('workflow_id');
    const limit = sp.get('limit');

    const filters: Record<string, unknown> = {};
    if (status) filters.status = status;
    if (messageType) filters.message_type = messageType;
    if (priority) filters.priority = priority;
    if (workflowId) filters.workflow_id = workflowId;
    if (limit) filters.limit = Number(limit);

    const messages = messageService.list(db, params.id, filters);
    return ok(messages);
  });

  // List all messages (global)
  router.get('/api/messages', (req) => {
    const sp = getSearchParams(req);
    const status = sp.get('status') as MessageStatus | null;
    const messageType = sp.get('message_type') as MessageType | null;
    const priority = sp.get('priority') as MessagePriority | null;
    const limit = sp.get('limit');

    const filters: Record<string, unknown> = {};
    if (status) filters.status = status;
    if (messageType) filters.message_type = messageType;
    if (priority) filters.priority = priority;
    if (limit) filters.limit = Number(limit);

    const messages = messageService.listAll(db, filters);
    return ok(messages);
  });

  // Count unread for an agent
  router.get('/api/agents/:id/messages/unread', (_, params) => {
    const result = messageService.countUnread(db, params.id);
    return ok(result);
  });

  // Count all unread (global)
  router.get('/api/messages/unread/count', () => {
    const count = messageService.countAllUnread(db);
    return ok({ count });
  });

  // Send message
  router.post('/api/messages', async (req) => {
    const body = await parseBody<{
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
    }>(req);

    if (!body) return badRequest('Invalid JSON body');
    if (!body.recipient_id) return badRequest('recipient_id is required');
    if (!body.message_type) return badRequest('message_type is required');
    if (!body.body) return badRequest('body is required');

    try {
      const result = messageService.send(db, body);
      broadcaster?.emit('message:new', {
        id: result.id,
        recipient_id: body.recipient_id,
        thread_id: result.thread_id,
      });
      return created(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Broadcast message
  router.post('/api/messages/broadcast', async (req) => {
    const body = await parseBody<{
      sender_id: string;
      recipient_filter: { role?: string; status?: string | string[]; runtime?: string };
      message_type: MessageType;
      body: string;
      subject?: string;
      priority?: MessagePriority;
      workflow_id?: string;
      expires_at?: number;
    }>(req);

    if (!body) return badRequest('Invalid JSON body');
    if (!body.sender_id) return badRequest('sender_id is required');
    if (!body.message_type) return badRequest('message_type is required');
    if (!body.body) return badRequest('body is required');

    try {
      const result = messageService.broadcast(
        db,
        body as Parameters<typeof messageService.broadcast>[1],
      );
      return created(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound(msg);
      return badRequest(msg);
    }
  });

  // Mark messages as read
  router.put('/api/messages/mark-read', async (req) => {
    const body = await parseBody<{ message_ids: string[] }>(req);
    if (!body) return badRequest('Invalid JSON body');
    if (!body.message_ids) return badRequest('message_ids is required');

    const count = messageService.markRead(db, body.message_ids);
    return ok({ updated: count });
  });

  // Get message by ID
  router.get('/api/messages/:id', (req, params) => {
    const sp = getSearchParams(req);
    const markRead = sp.get('mark_read') === 'true';
    const message = messageService.get(db, params.id, markRead);
    if (!message) return notFound(`Message not found: ${params.id}`);
    return ok(message);
  });

  // Get thread
  router.get('/api/threads/:id', (_, params) => {
    const messages = messageService.getThread(db, params.id);
    return ok(messages);
  });
}
