import type { DatabaseType } from '../db/connection';
import type { Session } from '../types/session';
import type { Workflow, WorkflowLockInfo } from '../types/workflow';

// --- Result types ---

export interface LockResult {
  success: boolean;
  locked_by?: string;
  locked_at?: number;
}

interface LockHolderCheck {
  locked: boolean;
  holder_session_id?: string;
  holder_pid?: number;
}

// --- Service functions ---

export function lock(db: DatabaseType, workflowId: string, sessionId: string): LockResult {
  const run = db.transaction(() => {
    const workflow = db
      .prepare('SELECT id, locked_by_session_id, locked_at FROM workflows WHERE id = ?')
      .get(workflowId) as Pick<Workflow, 'id' | 'locked_by_session_id' | 'locked_at'> | null;

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId) as Pick<
      Session,
      'id'
    > | null;

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Already locked by the same session — idempotent success
    if (workflow.locked_by_session_id === sessionId) {
      return { success: true, locked_by: sessionId, locked_at: workflow.locked_at ?? undefined };
    }

    // Locked by another session — check if holder still exists
    if (workflow.locked_by_session_id) {
      const holder = db
        .prepare('SELECT id FROM sessions WHERE id = ?')
        .get(workflow.locked_by_session_id) as Pick<Session, 'id'> | null;

      if (holder) {
        // Holder session still exists — deny lock
        return {
          success: false,
          locked_by: workflow.locked_by_session_id,
          locked_at: workflow.locked_at ?? undefined,
        };
      }
      // Holder session is gone — take over the lock (fall through)
    }

    // Acquire lock
    const now = Date.now();
    db.prepare(
      'UPDATE workflows SET locked_by_session_id = ?, locked_at = ?, updated_at = ? WHERE id = ?',
    ).run(sessionId, now, now, workflowId);

    return { success: true, locked_by: sessionId, locked_at: now };
  });

  return run();
}

export function unlock(db: DatabaseType, workflowId: string, sessionId: string): boolean {
  const workflow = db
    .prepare('SELECT id, locked_by_session_id FROM workflows WHERE id = ?')
    .get(workflowId) as Pick<Workflow, 'id' | 'locked_by_session_id'> | null;

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Not locked — idempotent success
  if (!workflow.locked_by_session_id) {
    return true;
  }

  // Locked by different session — error
  if (workflow.locked_by_session_id !== sessionId) {
    throw new Error(
      `Workflow ${workflowId} is locked by session ${workflow.locked_by_session_id}, not ${sessionId}`,
    );
  }

  const now = Date.now();
  db.prepare(
    'UPDATE workflows SET locked_by_session_id = NULL, locked_at = NULL, updated_at = ? WHERE id = ?',
  ).run(now, workflowId);

  return true;
}

export function getLockInfo(db: DatabaseType, workflowId: string): WorkflowLockInfo {
  const row = db
    .prepare(
      `SELECT w.locked_by_session_id, w.locked_at, s.pid as session_pid
       FROM workflows w
       LEFT JOIN sessions s ON w.locked_by_session_id = s.id
       WHERE w.id = ?`,
    )
    .get(workflowId) as {
    locked_by_session_id: string | null;
    locked_at: number | null;
    session_pid: number | null;
  } | null;

  if (!row) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  return {
    locked: row.locked_by_session_id !== null,
    session_id: row.locked_by_session_id,
    locked_at: row.locked_at,
    session_pid: row.session_pid,
  };
}

export function isLockedByOther(
  db: DatabaseType,
  workflowId: string,
  sessionId: string,
): LockHolderCheck {
  const row = db
    .prepare(
      `SELECT w.locked_by_session_id, s.pid as holder_pid
       FROM workflows w
       LEFT JOIN sessions s ON w.locked_by_session_id = s.id
       WHERE w.id = ?`,
    )
    .get(workflowId) as {
    locked_by_session_id: string | null;
    holder_pid: number | null;
  } | null;

  if (!row) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Not locked or locked by the same session
  if (!row.locked_by_session_id || row.locked_by_session_id === sessionId) {
    return { locked: false };
  }

  return {
    locked: true,
    holder_session_id: row.locked_by_session_id,
    holder_pid: row.holder_pid ?? undefined,
  };
}

export function releaseStaleWorkflowLocks(db: DatabaseType, timeoutMs: number): number {
  const cutoff = Date.now() - timeoutMs;
  const result = db
    .prepare(
      `UPDATE workflows
       SET locked_by_session_id = NULL, locked_at = NULL, updated_at = ?
       WHERE locked_by_session_id IS NOT NULL
         AND locked_by_session_id IN (
           SELECT id FROM sessions WHERE last_heartbeat < ?
         )`,
    )
    .run(Date.now(), cutoff);

  return result.changes;
}
