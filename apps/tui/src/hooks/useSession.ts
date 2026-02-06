import type { Session } from '@caw/core';
import { sessionService } from '@caw/core';
import { useDb } from '../context/db';
import { useSessionInfo } from '../context/session';
import { usePolling } from './usePolling';

export function useSessionList() {
  const db = useDb();

  return usePolling<Session[]>(() => {
    return sessionService.list(db);
  }, 5000);
}

export function useCurrentSession() {
  const db = useDb();
  const info = useSessionInfo();

  return usePolling<Session | null>(() => {
    if (!info) return null;
    return sessionService.get(db, info.sessionId);
  }, 5000);
}
