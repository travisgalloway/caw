import type { CountUnreadResult, Message, MessageListFilters } from '@caw/core';
import { messageService } from '@caw/core';
import { useDb } from '../context/db';
import { useAppStore } from '../store';
import { usePolling } from './usePolling';

export interface MessagesData {
  messages: Message[];
  unreadCount: CountUnreadResult;
}

export interface AllMessagesData {
  messages: Message[];
  totalUnread: number;
}

export function useMessages(agentId: string | null, filters?: MessageListFilters) {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);

  return usePolling<MessagesData | null>(() => {
    if (!agentId) {
      return null;
    }

    const messages = messageService.list(db, agentId, filters);
    const unreadCount = messageService.countUnread(db, agentId);

    return { messages, unreadCount };
  }, pollInterval);
}

export function useAllMessages() {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);

  return usePolling<AllMessagesData>(() => {
    const messages = messageService.listAll(db, { limit: 50 });
    const totalUnread = messageService.countAllUnread(db);

    return { messages, totalUnread };
  }, pollInterval);
}
