type EventType =
  | 'workflow:status'
  | 'task:updated'
  | 'agent:heartbeat'
  | 'agent:registered'
  | 'agent:unregistered'
  | 'message:new';

type Listener = (type: EventType, data: Record<string, unknown>) => void;

export interface Broadcaster {
  emit: (type: EventType, data: Record<string, unknown>) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createBroadcaster(): Broadcaster {
  const listeners = new Set<Listener>();

  return {
    emit(type, data) {
      for (const listener of listeners) {
        try {
          listener(type, data);
        } catch {
          // Ignore listener errors
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
