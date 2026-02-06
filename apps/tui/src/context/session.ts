import { createContext, useContext } from 'react';

export interface SessionInfo {
  sessionId: string;
  isDaemon: boolean;
  port: number;
}

export const SessionContext = createContext<SessionInfo | null>(null);

export function useSessionInfo(): SessionInfo | null {
  return useContext(SessionContext);
}
