import type { Agent, CountUnreadResult, Message } from '@caw/core';
import { agentService, messageService } from '@caw/core';
import { useDb } from '../context/db';
import { useAppStore } from '../store';
import { usePolling } from './usePolling';

export interface AgentDetailData {
  agent: Agent;
  messages: Message[];
  unreadCount: CountUnreadResult;
  capabilities: string[];
}

export function useAgentDetail(agentId: string | null) {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);
  const lastRefreshAt = useAppStore((s) => s.lastRefreshAt);

  return usePolling<AgentDetailData | null>(
    () => {
      if (!agentId) {
        return null;
      }

      const agent = agentService.get(db, agentId);
      if (!agent) {
        return null;
      }

      const messages = messageService.list(db, agentId, { limit: 50 });
      const unreadCount = messageService.countUnread(db, agentId);

      let capabilities: string[] = [];
      if (agent.capabilities) {
        try {
          capabilities = JSON.parse(agent.capabilities);
        } catch {
          // ignore malformed JSON
        }
      }

      return { agent, messages, unreadCount, capabilities };
    },
    pollInterval,
    lastRefreshAt,
  );
}
