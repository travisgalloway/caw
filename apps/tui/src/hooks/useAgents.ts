import type { Agent } from '@caw/core';
import { agentService } from '@caw/core';
import { useDb } from '../context/db';
import { useAppStore } from '../store';
import { usePolling } from './usePolling';

export function useAgents() {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);

  return usePolling<Agent[]>(() => {
    return agentService.list(db);
  }, pollInterval);
}
