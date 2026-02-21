import { execFileSync } from 'node:child_process';
import type { DatabaseType } from '../db/connection';
import type { Workspace } from '../types/workspace';
import { removeWorktree } from '../utils/worktree';
import * as workspaceService from './workspace.service';

export interface PrStatus {
  state: string;
  merged: boolean;
  mergeable: string;
  mergeCommit?: string;
}

export interface MergeCheckResult {
  checked: number;
  merged: number;
  stillOpen: number;
}

/**
 * Check PR status via `gh pr view`.
 */
export function checkPrStatus(prUrl: string): PrStatus {
  const raw = execFileSync('gh', ['pr', 'view', prUrl, '--json', 'state,mergeable,mergeCommit'], {
    encoding: 'utf-8',
    timeout: 30_000,
  }).trim();

  const data = JSON.parse(raw);
  return {
    state: data.state,
    merged: data.state === 'MERGED',
    mergeable: data.mergeable ?? 'UNKNOWN',
    mergeCommit: data.mergeCommit?.oid,
  };
}

/**
 * List workspaces in a workflow that have a pr_url and are still active.
 */
export function listAwaitingMerge(db: DatabaseType, workflowId: string): Workspace[] {
  return workspaceService.list(db, workflowId, 'active').filter((ws) => ws.pr_url);
}

/**
 * Complete a merge: update workspace status to merged, clean up worktree.
 */
export async function completeMerge(
  db: DatabaseType,
  workspaceId: string,
  mergeCommit: string,
  worktreePath?: string,
): Promise<void> {
  workspaceService.update(db, workspaceId, {
    status: 'merged',
    mergeCommit,
  });

  const pathToRemove = worktreePath ?? workspaceService.get(db, workspaceId)?.path;
  if (pathToRemove) {
    try {
      await removeWorktree(pathToRemove);
    } catch {
      // Worktree may already be removed
    }
  }
}
