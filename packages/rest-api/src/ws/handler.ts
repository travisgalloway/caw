import type { ServerWebSocket } from 'bun';
import type { Broadcaster } from './broadcaster';

interface WsData {
  channels: Set<string>;
}

export interface WsHandler {
  // biome-ignore lint/suspicious/noExplicitAny: Bun's Server type is generic and varies by context
  upgrade: (req: Request, server: any) => boolean;
  broadcaster: Broadcaster;
}

export function createWsHandler(broadcaster: Broadcaster): WsHandler {
  // Subscribe to broadcaster and forward events to WebSocket clients
  const clients = new Set<ServerWebSocket<WsData>>();

  broadcaster.subscribe((type, data) => {
    const payload = JSON.stringify({ type, data });

    // Determine which channels this event belongs to
    const channels: string[] = ['global'];
    const id = data.id as string | undefined;
    const workflowId = data.workflow_id as string | undefined;

    if (type.startsWith('workflow:') && id) {
      channels.push(`workflow:${id}`);
    }
    if (type.startsWith('task:') && workflowId) {
      channels.push(`workflow:${workflowId}`);
    }
    if (type.startsWith('agent:') && id) {
      channels.push(`agent:${id}`);
    }
    if (type === 'message:new') {
      const recipientId = data.recipient_id as string | undefined;
      if (recipientId) channels.push(`agent:${recipientId}`);
    }

    for (const ws of clients) {
      // Send if client subscribed to any matching channel
      const subscribed = ws.data.channels;
      if (channels.some((ch) => subscribed.has(ch))) {
        ws.send(payload);
      }
    }
  });

  return {
    broadcaster,
    // biome-ignore lint/suspicious/noExplicitAny: Bun Server type is generic, using any for compatibility
    upgrade(req: Request, server: any): boolean {
      const url = new URL(req.url);
      if (url.pathname !== '/ws') return false;

      const upgraded = server.upgrade(req, {
        data: { channels: new Set(['global']) },
      });

      return !!upgraded;
    },
  };
}

export const websocket = {
  open(_ws: ServerWebSocket<WsData>) {
    // Client is connected, default subscribed to 'global'
  },
  message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
    try {
      const msg = JSON.parse(typeof message === 'string' ? message : message.toString());

      if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
        ws.data.channels.add(msg.channel);
        ws.send(JSON.stringify({ type: 'subscribed', channel: msg.channel }));
      } else if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
        ws.data.channels.delete(msg.channel);
        ws.send(JSON.stringify({ type: 'unsubscribed', channel: msg.channel }));
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch {
      // Ignore malformed messages
    }
  },
  close(_ws: ServerWebSocket<WsData>) {
    // Cleanup handled automatically by Bun
  },
};
