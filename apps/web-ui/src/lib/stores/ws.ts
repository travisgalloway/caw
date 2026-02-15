import { writable } from 'svelte/store';

interface WsEvent {
  type: string;
  data: Record<string, unknown>;
}

interface WsStore {
  connected: boolean;
  lastEvent: WsEvent | null;
}

function createWsStore() {
  const { subscribe, set, update } = writable<WsStore>({
    connected: false,
    lastEvent: null,
  });

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const subscriptions = new Set<string>();

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.onopen = () => {
      update((s) => ({ ...s, connected: true }));
      // Re-subscribe to channels
      for (const channel of subscriptions) {
        ws?.send(JSON.stringify({ type: 'subscribe', channel }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsEvent;
        update((s) => ({ ...s, lastEvent: msg }));
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      update((s) => ({ ...s, connected: false }));
      // Auto-reconnect after 3 seconds
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws?.close();
    ws = null;
    set({ connected: false, lastEvent: null });
  }

  function subscribeChannel(channel: string) {
    subscriptions.add(channel);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', channel }));
    }
  }

  function unsubscribeChannel(channel: string) {
    subscriptions.delete(channel);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', channel }));
    }
  }

  return {
    subscribe,
    connect,
    disconnect,
    subscribeChannel,
    unsubscribeChannel,
  };
}

export const wsStore = createWsStore();
