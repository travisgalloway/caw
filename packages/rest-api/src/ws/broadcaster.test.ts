import { describe, expect, test } from 'bun:test';
import { createBroadcaster } from './broadcaster';

describe('broadcaster', () => {
  test('emits events to subscribers', () => {
    const broadcaster = createBroadcaster();
    const received: Array<{ type: string; data: Record<string, unknown> }> = [];

    broadcaster.subscribe((type, data) => {
      received.push({ type, data });
    });

    broadcaster.emit('workflow:status', { id: 'wf_123', status: 'in_progress' });
    broadcaster.emit('task:updated', { id: 'tk_456', status: 'completed' });

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('workflow:status');
    expect(received[0].data.id).toBe('wf_123');
    expect(received[1].type).toBe('task:updated');
  });

  test('unsubscribe removes listener', () => {
    const broadcaster = createBroadcaster();
    const received: string[] = [];

    const unsub = broadcaster.subscribe((type) => {
      received.push(type);
    });

    broadcaster.emit('workflow:status', { id: 'wf_1' });
    unsub();
    broadcaster.emit('workflow:status', { id: 'wf_2' });

    expect(received).toHaveLength(1);
  });

  test('handles multiple subscribers', () => {
    const broadcaster = createBroadcaster();
    let count1 = 0;
    let count2 = 0;

    broadcaster.subscribe(() => {
      count1++;
    });
    broadcaster.subscribe(() => {
      count2++;
    });

    broadcaster.emit('agent:heartbeat', { id: 'ag_123' });

    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  test('ignores errors in listeners', () => {
    const broadcaster = createBroadcaster();
    const received: string[] = [];

    broadcaster.subscribe(() => {
      throw new Error('bad listener');
    });
    broadcaster.subscribe((type) => {
      received.push(type);
    });

    broadcaster.emit('message:new', { id: 'msg_123' });

    expect(received).toHaveLength(1);
  });
});
