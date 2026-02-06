import type { DatabaseType, Task, Workspace } from '@caw/core';
import { lockService } from '@caw/core';
import { ToolCallError } from './types';

/**
 * Throws WORKFLOW_LOCKED if the workflow is locked by another session.
 * No-op when sessionId is undefined (backward compatibility).
 */
export function requireWorkflowLock(
  db: DatabaseType,
  workflowId: string,
  sessionId?: string,
): void {
  if (!sessionId) return;

  const check = lockService.isLockedByOther(db, workflowId, sessionId);
  if (check.locked) {
    throw new ToolCallError({
      code: 'WORKFLOW_LOCKED',
      message: `Workflow ${workflowId} is locked by session ${check.holder_session_id} (PID ${check.holder_pid ?? 'unknown'})`,
      recoverable: true,
      suggestion:
        'The workflow is locked by another session. Wait for the other session to release the lock or end that session before trying again.',
    });
  }
}

/**
 * Resolves task → workflow_id, then checks the lock.
 */
export function requireWorkflowLockForTask(
  db: DatabaseType,
  taskId: string,
  sessionId?: string,
): void {
  if (!sessionId) return;

  const task = db.prepare('SELECT workflow_id FROM tasks WHERE id = ?').get(taskId) as Pick<
    Task,
    'workflow_id'
  > | null;

  if (!task) return; // let the actual tool handler throw TASK_NOT_FOUND

  requireWorkflowLock(db, task.workflow_id, sessionId);
}

/**
 * Resolves workspace → workflow_id, then checks the lock.
 */
export function requireWorkflowLockForWorkspace(
  db: DatabaseType,
  workspaceId: string,
  sessionId?: string,
): void {
  if (!sessionId) return;

  const workspace = db
    .prepare('SELECT workflow_id FROM workspaces WHERE id = ?')
    .get(workspaceId) as Pick<Workspace, 'workflow_id'> | null;

  if (!workspace) return; // let the actual tool handler throw WORKSPACE_NOT_FOUND

  requireWorkflowLock(db, workspace.workflow_id, sessionId);
}
