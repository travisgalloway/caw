import { toast } from 'svelte-sonner';

interface WsEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Maps WebSocket events to toast notifications.
 */
export function handleWsToast(event: WsEvent) {
  const { type, data } = event;

  switch (type) {
    case 'workflow:status': {
      const status = data.status as string;
      const name = (data.name as string) ?? (data.id as string);
      if (status === 'completed') {
        toast.success(`Workflow "${name}" completed`);
      } else if (status === 'failed') {
        toast.error(`Workflow "${name}" failed`);
      }
      break;
    }
    case 'task:updated': {
      const status = data.status as string;
      const name = (data.name as string) ?? (data.id as string);
      if (status === 'failed') {
        toast.error(`Task "${name}" failed`);
      }
      break;
    }
    case 'agent:registered': {
      const id = data.id as string;
      toast.info(`Agent ${id} registered`);
      break;
    }
    case 'message:new': {
      const subject = (data.subject as string) ?? 'New message';
      toast.info(subject);
      break;
    }
  }
}
