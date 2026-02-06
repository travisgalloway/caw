import type { DatabaseType } from '../db/connection';
import type { Session } from '../types/session';
import { sessionId } from '../utils/id';

// --- Parameter types ---

export interface SessionRegisterParams {
  pid: number;
  is_daemon?: boolean;
  metadata?: Record<string, unknown>;
}

// --- Service functions ---

export function register(db: DatabaseType, params: SessionRegisterParams): Session {
  const id = sessionId();
  const now = Date.now();
  const isDaemon = params.is_daemon ? 1 : 0;
  const metadata = params.metadata ? JSON.stringify(params.metadata) : null;

  db.prepare(
    `INSERT INTO sessions (id, pid, started_at, last_heartbeat, is_daemon, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, params.pid, now, now, isDaemon, metadata);

  return {
    id,
    pid: params.pid,
    started_at: now,
    last_heartbeat: now,
    is_daemon: isDaemon,
    metadata,
  };
}

export function heartbeat(db: DatabaseType, id: string): Session {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | null;

  if (!session) {
    throw new Error(`Session not found: ${id}`);
  }

  const now = Date.now();
  db.prepare('UPDATE sessions SET last_heartbeat = ? WHERE id = ?').run(now, id);

  return { ...session, last_heartbeat: now };
}

export function get(db: DatabaseType, id: string): Session | null {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | null;
  return row ?? null;
}

export function list(db: DatabaseType): Session[] {
  return db.prepare('SELECT * FROM sessions ORDER BY started_at ASC').all() as Session[];
}

export function getDaemon(db: DatabaseType): Session | null {
  const row = db
    .prepare('SELECT * FROM sessions WHERE is_daemon = 1 LIMIT 1')
    .get() as Session | null;
  return row ?? null;
}

export function promoteToDaemon(db: DatabaseType, id: string): Session {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | null;

  if (!session) {
    throw new Error(`Session not found: ${id}`);
  }

  if (session.is_daemon === 1) return session;

  // Demote any existing daemon before promoting (defense-in-depth)
  db.prepare('UPDATE sessions SET is_daemon = 0 WHERE is_daemon = 1 AND id != ?').run(id);
  db.prepare('UPDATE sessions SET is_daemon = 1 WHERE id = ?').run(id);

  return { ...session, is_daemon: 1 };
}

export function deregister(db: DatabaseType, id: string): boolean {
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getStale(db: DatabaseType, timeoutMs: number): Session[] {
  const cutoff = Date.now() - timeoutMs;
  return db
    .prepare('SELECT * FROM sessions WHERE last_heartbeat < ? ORDER BY last_heartbeat ASC')
    .all(cutoff) as Session[];
}

export function cleanupStale(db: DatabaseType, timeoutMs: number): number {
  const cutoff = Date.now() - timeoutMs;
  const result = db.prepare('DELETE FROM sessions WHERE last_heartbeat < ?').run(cutoff);
  return result.changes;
}
