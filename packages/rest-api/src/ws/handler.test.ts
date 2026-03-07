import { beforeEach, describe, expect, test } from 'bun:test';
import type { Broadcaster } from './broadcaster';
import { createBroadcaster } from './broadcaster';
import { createWsHandler } from './handler';

// Minimal mock for ServerWebSocket<WsData>
function createMockWs() {
  const sent: string[] = [];
  const channels = new Set<string>(['global']);
  return {
    data: { channels },
    send(msg: string) {
      sent.push(msg);
    },
    sent,
  };
}

describe('broadcaster', () => {
  test('emits events to subscribers', () => {
    const broadcaster = createBroadcaster();
    const received: Array<{ type: string; data: Record<string, unknown> }> = [];

    broadcaster.subscribe((type, data) => received.push({ type, data }));
    broadcaster.emit('workflow:status', { id: 'wf_123', status: 'in_progress' });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('workflow:status');
    expect(received[0].data.id).toBe('wf_123');
  });

  test('unsubscribe stops events', () => {
    const broadcaster = createBroadcaster();
    const received: unknown[] = [];

    const unsub = broadcaster.subscribe((type, data) => received.push(data));
    broadcaster.emit('workflow:status', { id: 'wf_1' });
    unsub();
    broadcaster.emit('workflow:status', { id: 'wf_2' });

    expect(received).toHaveLength(1);
  });

  test('ignores listener errors', () => {
    const broadcaster = createBroadcaster();
    let called = false;

    broadcaster.subscribe(() => {
      throw new Error('listener error');
    });
    broadcaster.subscribe(() => {
      called = true;
    });

    broadcaster.emit('workflow:status', { id: 'wf_1' });
    expect(called).toBe(true);
  });
});

describe('WsHandler', () => {
  let broadcaster: Broadcaster;

  beforeEach(() => {
    broadcaster = createBroadcaster();
  });

  test('createWsHandler returns handler with expected shape', () => {
    const handler = createWsHandler(broadcaster);

    expect(handler.broadcaster).toBe(broadcaster);
    expect(typeof handler.upgrade).toBe('function');
    expect(typeof handler.websocket.open).toBe('function');
    expect(typeof handler.websocket.message).toBe('function');
    expect(typeof handler.websocket.close).toBe('function');
  });

  test('websocket.message handles subscribe', () => {
    const handler = createWsHandler(broadcaster);
    const ws = createMockWs();

    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.message(
      ws as any,
      JSON.stringify({ type: 'subscribe', channel: 'workflow:wf_123' }),
    );

    expect(ws.data.channels.has('workflow:wf_123')).toBe(true);
    expect(ws.sent).toHaveLength(1);
    const response = JSON.parse(ws.sent[0]);
    expect(response.type).toBe('subscribed');
    expect(response.channel).toBe('workflow:wf_123');
  });

  test('websocket.message handles unsubscribe', () => {
    const handler = createWsHandler(broadcaster);
    const ws = createMockWs();

    // Subscribe first
    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.message(
      ws as any,
      JSON.stringify({ type: 'subscribe', channel: 'workflow:wf_123' }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.message(
      ws as any,
      JSON.stringify({ type: 'unsubscribe', channel: 'workflow:wf_123' }),
    );

    expect(ws.data.channels.has('workflow:wf_123')).toBe(false);
    expect(ws.sent).toHaveLength(2);
    const response = JSON.parse(ws.sent[1]);
    expect(response.type).toBe('unsubscribed');
  });

  test('websocket.message handles ping', () => {
    const handler = createWsHandler(broadcaster);
    const ws = createMockWs();

    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.message(ws as any, JSON.stringify({ type: 'ping' }));

    expect(ws.sent).toHaveLength(1);
    const response = JSON.parse(ws.sent[0]);
    expect(response.type).toBe('pong');
  });

  test('websocket.message ignores malformed messages', () => {
    const handler = createWsHandler(broadcaster);
    const ws = createMockWs();

    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.message(ws as any, 'not json');
    expect(ws.sent).toHaveLength(0);
  });

  test('websocket.message ignores unknown message types', () => {
    const handler = createWsHandler(broadcaster);
    const ws = createMockWs();

    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.message(ws as any, JSON.stringify({ type: 'unknown' }));
    expect(ws.sent).toHaveLength(0);
  });

  test('broadcaster events are forwarded to subscribed clients', () => {
    const handler = createWsHandler(broadcaster);
    const ws = createMockWs();

    // Add to clients via open
    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.open(ws as any);

    // Client is subscribed to 'global' by default
    broadcaster.emit('workflow:status', { id: 'wf_123', status: 'completed' });

    expect(ws.sent).toHaveLength(1);
    const event = JSON.parse(ws.sent[0]);
    expect(event.type).toBe('workflow:status');
    expect(event.data.id).toBe('wf_123');
  });

  test('broadcaster events not sent to unsubscribed clients', () => {
    const handler = createWsHandler(broadcaster);
    const ws = createMockWs();
    ws.data.channels.clear(); // Remove global subscription

    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.open(ws as any);

    broadcaster.emit('workflow:status', { id: 'wf_123', status: 'completed' });

    expect(ws.sent).toHaveLength(0);
  });

  test('broadcaster sends workflow events to workflow channel subscribers', () => {
    const handler = createWsHandler(broadcaster);
    const ws = createMockWs();
    ws.data.channels.clear();
    ws.data.channels.add('workflow:wf_123');

    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.open(ws as any);

    broadcaster.emit('workflow:status', { id: 'wf_123', status: 'in_progress' });

    expect(ws.sent).toHaveLength(1);
  });

  test('close removes client from set', () => {
    const handler = createWsHandler(broadcaster);
    const ws = createMockWs();

    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.open(ws as any);
    // biome-ignore lint/suspicious/noExplicitAny: mock WebSocket for testing
    handler.websocket.close(ws as any);

    broadcaster.emit('workflow:status', { id: 'wf_123', status: 'completed' });
    expect(ws.sent).toHaveLength(0);
  });

  test('upgrade returns false for non-ws path', () => {
    const handler = createWsHandler(broadcaster);
    const request = new Request('http://localhost/api/workflows');
    const mockServer = {
      upgrade: () => false,
    };

    const result = handler.upgrade(request, mockServer);
    expect(result).toBe(false);
  });
});
