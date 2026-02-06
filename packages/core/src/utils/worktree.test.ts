import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorktree, listWorktrees, removeWorktree } from './worktree';

let repoPath: string;
let worktreesDir: string;

async function git(args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
  }
}

beforeEach(async () => {
  repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'caw-worktree-test-')));
  worktreesDir = `${repoPath}-worktrees`;
  await git(['init', '-b', 'main'], repoPath);
  await git(['config', 'user.email', 'test@test.com'], repoPath);
  await git(['config', 'user.name', 'Test'], repoPath);
  await git(['commit', '--allow-empty', '-m', 'initial'], repoPath);
});

afterEach(() => {
  rmSync(repoPath, { recursive: true, force: true });
  if (existsSync(worktreesDir)) {
    rmSync(worktreesDir, { recursive: true, force: true });
  }
});

describe('createWorktree', () => {
  it('creates a worktree and returns the path', async () => {
    const path = await createWorktree(repoPath, 'feature-branch');
    expect(path).toBe(join(worktreesDir, 'feature-branch'));
    expect(existsSync(path)).toBe(true);
  });

  it('creates a worktree from a base branch', async () => {
    const path = await createWorktree(repoPath, 'from-main', 'main');
    expect(existsSync(path)).toBe(true);
  });

  it('sanitizes branch names with special characters', async () => {
    const path = await createWorktree(repoPath, 'feat/my-branch');
    expect(path).toBe(join(worktreesDir, 'feat-my-branch'));
    expect(existsSync(path)).toBe(true);
  });

  it('throws on duplicate branch name', async () => {
    await createWorktree(repoPath, 'dup-branch');
    await expect(createWorktree(repoPath, 'dup-branch')).rejects.toThrow();
  });
});

describe('removeWorktree', () => {
  it('removes an existing worktree', async () => {
    const path = await createWorktree(repoPath, 'to-remove');
    expect(existsSync(path)).toBe(true);
    await removeWorktree(path);
    expect(existsSync(path)).toBe(false);
  });

  it('throws on nonexistent worktree', async () => {
    await expect(removeWorktree('/nonexistent/path')).rejects.toThrow();
  });
});

describe('listWorktrees', () => {
  it('lists the main repo as the first entry', async () => {
    const worktrees = await listWorktrees(repoPath);
    expect(worktrees.length).toBe(1);
    expect(worktrees[0].path).toBe(repoPath);
    expect(worktrees[0].isMain).toBe(true);
    expect(worktrees[0].branch).toBe('main');
  });

  it('lists created worktrees', async () => {
    await createWorktree(repoPath, 'branch-a');
    await createWorktree(repoPath, 'branch-b');

    const worktrees = await listWorktrees(repoPath);
    expect(worktrees.length).toBe(3);

    const branches = worktrees.map((w) => w.branch);
    expect(branches).toContain('main');
    expect(branches).toContain('branch-a');
    expect(branches).toContain('branch-b');
  });

  it('returns correct commit hash info', async () => {
    const worktrees = await listWorktrees(repoPath);
    expect(worktrees[0].commitHash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('marks only the first entry as main', async () => {
    await createWorktree(repoPath, 'side-branch');
    const worktrees = await listWorktrees(repoPath);

    const mainWorktrees = worktrees.filter((w) => w.isMain);
    expect(mainWorktrees.length).toBe(1);
    expect(mainWorktrees[0].path).toBe(repoPath);
  });
});
