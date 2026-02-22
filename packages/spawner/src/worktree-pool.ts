import { createWorktree, removeWorktree } from '@caw/core';

export interface WorktreePoolOptions {
  /** Path to the main repository. */
  repoPath: string;
  /** Number of worktrees to pre-create. */
  poolSize: number;
  /** Base branch for worktrees (default: 'main'). */
  baseBranch?: string;
  /** Prefix for worktree branch names (default: 'caw-pool'). */
  branchPrefix?: string;
}

interface PooledWorktree {
  path: string;
  branch: string;
  inUse: boolean;
  taskId: string | null;
}

/**
 * Pre-creates and manages a pool of git worktrees.
 * Worktrees are reused across sequential tasks, saving 500ms-2s per task creation.
 */
export class WorktreePool {
  private worktrees: PooledWorktree[] = [];
  private options: WorktreePoolOptions;
  private counter = 0;
  private initialized = false;

  constructor(options: WorktreePoolOptions) {
    this.options = options;
  }

  /**
   * Pre-create the worktree pool.
   * Call this when a workflow starts, before tasks are assigned.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const prefix = this.options.branchPrefix ?? 'caw-pool';
    const base = this.options.baseBranch ?? 'main';
    const promises: Promise<void>[] = [];

    for (let i = 0; i < this.options.poolSize; i++) {
      const branch = `${prefix}-${Date.now()}-${i}`;
      promises.push(
        createWorktree(this.options.repoPath, branch, base).then((path) => {
          this.worktrees.push({
            path,
            branch,
            inUse: false,
            taskId: null,
          });
        }),
      );
    }

    await Promise.allSettled(promises);
    this.initialized = true;
  }

  /**
   * Acquire a worktree from the pool for a task.
   * If no worktree is available, creates one on demand.
   * Returns the worktree path and branch.
   */
  async acquire(taskId: string): Promise<{ path: string; branch: string }> {
    // Try to reuse an available worktree
    const available = this.worktrees.find((wt) => !wt.inUse);
    if (available) {
      available.inUse = true;
      available.taskId = taskId;
      return { path: available.path, branch: available.branch };
    }

    // No worktrees available — create one on demand
    const prefix = this.options.branchPrefix ?? 'caw-pool';
    const base = this.options.baseBranch ?? 'main';
    const branch = `${prefix}-overflow-${this.counter++}`;
    const path = await createWorktree(this.options.repoPath, branch, base);

    const wt: PooledWorktree = { path, branch, inUse: true, taskId };
    this.worktrees.push(wt);

    return { path, branch };
  }

  /**
   * Release a worktree back to the pool.
   * The worktree is NOT destroyed — it's recycled for the next task.
   */
  release(taskId: string): void {
    const wt = this.worktrees.find((w) => w.taskId === taskId);
    if (wt) {
      wt.inUse = false;
      wt.taskId = null;
    }
  }

  /**
   * Get the worktree assigned to a task, or null if not assigned.
   */
  getForTask(taskId: string): { path: string; branch: string } | null {
    const wt = this.worktrees.find((w) => w.taskId === taskId);
    return wt ? { path: wt.path, branch: wt.branch } : null;
  }

  /**
   * Get pool statistics.
   */
  getStats(): { total: number; inUse: number; available: number } {
    const inUse = this.worktrees.filter((w) => w.inUse).length;
    return {
      total: this.worktrees.length,
      inUse,
      available: this.worktrees.length - inUse,
    };
  }

  /**
   * Destroy all worktrees in the pool.
   * Call this when the workflow completes.
   */
  async destroy(): Promise<void> {
    const promises = this.worktrees.map(async (wt) => {
      try {
        await removeWorktree(wt.path);
      } catch {
        // Best effort — worktree may already be removed
      }
    });

    await Promise.allSettled(promises);
    this.worktrees = [];
    this.initialized = false;
  }

  /** Check if the pool has been initialized. */
  isInitialized(): boolean {
    return this.initialized;
  }
}
