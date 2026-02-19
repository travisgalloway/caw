import { dirname, join } from 'node:path';

export interface WorktreeInfo {
  path: string;
  commitHash: string;
  branch: string;
  isMain: boolean;
  isDetached: boolean;
}

function sanitizeBranch(branch: string): string {
  if (branch.includes('..')) {
    throw new Error(`Invalid branch name "${branch}": must not contain ".."`);
  }
  if (branch.endsWith('.lock')) {
    throw new Error(`Invalid branch name "${branch}": must not end with ".lock"`);
  }
  const sanitized = branch.replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!sanitized || /^[-_]+$/.test(sanitized)) {
    throw new Error(
      `Invalid branch name "${branch}": cannot derive a safe worktree directory name`,
    );
  }
  return sanitized;
}

async function execGit(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`);
  }
  return await new Response(proc.stdout).text();
}

/**
 * Creates a git worktree at {repoPath}-worktrees/{sanitized-branch}.
 * Returns the absolute path to the created worktree.
 */
export async function createWorktree(
  repoPath: string,
  branch: string,
  baseBranch?: string,
): Promise<string> {
  const worktreeDir = `${repoPath}-worktrees`;
  const worktreePath = join(worktreeDir, sanitizeBranch(branch));

  const args = ['worktree', 'add', '-b', branch, '--', worktreePath];
  if (baseBranch) {
    args.push(baseBranch);
  }

  await execGit(args, repoPath);
  return worktreePath;
}

/**
 * Removes a git worktree with --force.
 */
export async function removeWorktree(worktreePath: string, repoPath?: string): Promise<void> {
  // Worktrees live at {repoPath}-worktrees/{name}, so derive repoPath if not provided
  // dirname(path) = {repoPath}-worktrees, strip the "-worktrees" suffix to get repoPath
  const cwd = repoPath ?? dirname(worktreePath).replace(/-worktrees$/, '');
  await execGit(['worktree', 'remove', '--force', worktreePath], cwd);
}

/**
 * Parses `git worktree list --porcelain` and returns structured info.
 */
export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  const output = await execGit(['worktree', 'list', '--porcelain'], repoPath);
  const worktrees: WorktreeInfo[] = [];
  const blocks = output.trim().split('\n\n');

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.trim().split('\n');
    let path = '';
    let commitHash = '';
    let branch = '';
    let isDetached = false;
    let isMain = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
      } else if (line.startsWith('HEAD ')) {
        commitHash = line.slice('HEAD '.length);
      } else if (line.startsWith('branch ')) {
        branch = line.slice('branch '.length).replace('refs/heads/', '');
      } else if (line === 'detached') {
        isDetached = true;
      } else if (line === 'bare') {
        isMain = true;
      }
    }

    // The first worktree entry is always the main worktree
    if (worktrees.length === 0) {
      isMain = true;
    }

    worktrees.push({ path, commitHash, branch, isMain, isDetached });
  }

  return worktrees;
}
