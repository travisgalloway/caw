export interface Session {
  id: string;
  pid: number;
  started_at: number;
  last_heartbeat: number;
  is_daemon: number;
  metadata: string | null;
}
