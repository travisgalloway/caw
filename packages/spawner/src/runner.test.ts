import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { DatabaseType } from '@caw/core';
import {
  createConnection,
  runMigrations,
  taskService,
  workflowService,
  workspaceService,
} from '@caw/core';
import { clearRegistry } from './registry';
import { WorkflowRunner } from './runner';
import type { SpawnerConfig, WorkflowRunnerReporter } from './types';

let mockDb: DatabaseType | null = null;
let spawnCount = 0;
let mockDelay = 20;

function mockSpawn(_cmd: string, args: string[]) {
  spawnCount++;

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin,
    pid: 10000 + spawnCount,
    killed: false,
    kill(_signal?: string) {
      this.killed = true;
      stdout.end();
      setTimeout(() => proc.emit('close', 1), 10);
    },
  });

  const promptIdx = args.indexOf('-p');
  const promptArg = promptIdx >= 0 ? args[promptIdx + 1] : '';
  const taskIdMatch = promptArg.match(/tk_[0-9a-z]{12}/);
  const taskId = taskIdMatch?.[0] ?? null;

  const sessionId = `sess_${spawnCount}`;

  setTimeout(() => {
    stdout.write(`${JSON.stringify({ type: 'system', subtype: 'init', session_id: sessionId })}\n`);

    if (!taskId || !mockDb) return;

    setTimeout(() => {
      try {
        const task = mockDb?.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
          status: string;
        } | null;
        if (!task || task.status === 'completed') return;

        if (task.status === 'pending') {
          taskService.updateStatus(mockDb as DatabaseType, taskId, 'planning');
        }
        const refreshed = mockDb?.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
          status: string;
        } | null;
        if (refreshed?.status === 'planning') {
          taskService.updateStatus(mockDb as DatabaseType, taskId, 'completed', {
            outcome: `Mock completed ${taskId}`,
          });
        }
      } catch {
        // Task may have already transitioned
      }

      stdout.write(`${JSON.stringify({ type: 'result', subtype: 'success' })}\n`);
      stdout.end();
      setTimeout(() => proc.emit('close', 0), 10);
    }, mockDelay);
  }, 5);

  return proc as unknown as ChildProcess;
}

function createTestDb(): DatabaseType {
  const db = createConnection(':memory:');
  runMigrations(db);
  return db;
}

function createSpawnerConfig(
  workflowId: string,
  overrides?: Partial<SpawnerConfig>,
): SpawnerConfig {
  return {
    workflowId,
    maxAgents: 1,
    model: 'claude-sonnet-4-5',
    permissionMode: 'bypassPermissions' as const,
    maxTurns: 10,
    mcpServerUrl: 'http://localhost:3100/mcp',
    cwd: '/tmp',
    spawnFn: mockSpawn,
    ...overrides,
  };
}

function createWorkflowWithPlan(
  db: DatabaseType,
  plan: {
    summary: string;
    tasks: Array<{ name: string; description?: string }>;
  },
) {
  const wf = workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'prompt',
    source_content: 'test',
  });
  workflowService.setPlan(db, wf.id, plan);
  return wf;
}

describe('WorkflowRunner', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createTestDb();
    mockDb = db;
    spawnCount = 0;
    mockDelay = 20;
  });

  afterEach(() => {
    clearRegistry();
    mockDb = null;
    db.close();
  });

  it('completes a single-task workflow', async () => {
    const wf = createWorkflowWithPlan(db, {
      summary: 'Test',
      tasks: [{ name: 'Task 1' }],
    });

    const runner = new WorkflowRunner(db, {
      spawnerConfig: createSpawnerConfig(wf.id),
    });

    const result = await runner.run();
    expect(result.outcome).toBe('completed');
  });

  it('reports events via reporter', async () => {
    const wf = createWorkflowWithPlan(db, {
      summary: 'Test',
      tasks: [{ name: 'Task 1' }],
    });

    const events: string[] = [];
    const reporter: WorkflowRunnerReporter = {
      onAgentStarted() {
        events.push('agent_started');
      },
      onAgentCompleted() {
        events.push('agent_completed');
      },
      onWorkflowComplete() {
        events.push('workflow_complete');
      },
    };

    const runner = new WorkflowRunner(db, {
      spawnerConfig: createSpawnerConfig(wf.id),
      reporter,
    });

    await runner.run();
    expect(events).toContain('agent_started');
    expect(events).toContain('agent_completed');
    expect(events).toContain('workflow_complete');
  });

  it('returns detached when detach is true', async () => {
    const wf = createWorkflowWithPlan(db, {
      summary: 'Test',
      tasks: [{ name: 'Task 1' }],
    });

    const runner = new WorkflowRunner(db, {
      spawnerConfig: createSpawnerConfig(wf.id),
      detach: true,
    });

    const result = await runner.run();
    expect(result.outcome).toBe('detached');

    // Clean up the running spawner
    await runner.getSpawner().shutdown();
  });

  it('returns failed when workflow is not found', async () => {
    const runner = new WorkflowRunner(db, {
      spawnerConfig: createSpawnerConfig('wf_nonexistent'),
    });

    const result = await runner.run();
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') {
      expect(result.error).toContain('not found');
    }
  });

  it('returns awaiting_merge when tasks complete with PR URLs', async () => {
    const wf = createWorkflowWithPlan(db, {
      summary: 'Test',
      tasks: [{ name: 'Task 1' }],
    });

    // Create a workspace with a PR URL
    workspaceService.create(db, {
      workflowId: wf.id,
      path: '/tmp/test-worktree',
      branch: 'feature-1',
      baseBranch: 'main',
      repositoryPath: '/tmp',
    });
    // Set pr_url on the workspace
    const workspaces = workspaceService.list(db, wf.id);
    workspaceService.update(db, workspaces[0].id, { prUrl: 'https://github.com/test/repo/pull/1' });

    const runner = new WorkflowRunner(db, {
      spawnerConfig: createSpawnerConfig(wf.id),
    });

    const result = await runner.run();
    expect(result.outcome).toBe('awaiting_merge');
    if (result.outcome === 'awaiting_merge') {
      expect(result.prUrls).toContain('https://github.com/test/repo/pull/1');
    }
  });

  it('invokes postCompletionHook on awaiting_merge', async () => {
    const wf = createWorkflowWithPlan(db, {
      summary: 'Test',
      tasks: [{ name: 'Task 1' }],
    });

    // Create a workspace with a PR URL
    workspaceService.create(db, {
      workflowId: wf.id,
      path: '/tmp/test-worktree',
      branch: 'feature-1',
      baseBranch: 'main',
      repositoryPath: '/tmp',
    });
    const workspaces = workspaceService.list(db, wf.id);
    workspaceService.update(db, workspaces[0].id, { prUrl: 'https://github.com/test/repo/pull/1' });

    let hookCalled = false;
    let hookWorkflowId = '';
    let hookPrUrls: string[] = [];

    const runner = new WorkflowRunner(db, {
      spawnerConfig: createSpawnerConfig(wf.id),
      postCompletionHook: async (workflowId, prUrls) => {
        hookCalled = true;
        hookWorkflowId = workflowId;
        hookPrUrls = prUrls;
      },
    });

    await runner.run();
    expect(hookCalled).toBe(true);
    expect(hookWorkflowId).toBe(wf.id);
    expect(hookPrUrls).toContain('https://github.com/test/repo/pull/1');
  });

  it('does not crash if postCompletionHook throws', async () => {
    const wf = createWorkflowWithPlan(db, {
      summary: 'Test',
      tasks: [{ name: 'Task 1' }],
    });

    workspaceService.create(db, {
      workflowId: wf.id,
      path: '/tmp/test-worktree',
      branch: 'feature-1',
      baseBranch: 'main',
      repositoryPath: '/tmp',
    });
    const workspaces = workspaceService.list(db, wf.id);
    workspaceService.update(db, workspaces[0].id, { prUrl: 'https://github.com/test/repo/pull/1' });

    const runner = new WorkflowRunner(db, {
      spawnerConfig: createSpawnerConfig(wf.id),
      postCompletionHook: async () => {
        throw new Error('Hook error');
      },
    });

    const result = await runner.run();
    // Should still return awaiting_merge, not crash
    expect(result.outcome).toBe('awaiting_merge');
  });

  it('exposes spawner via getSpawner()', () => {
    const wf = createWorkflowWithPlan(db, {
      summary: 'Test',
      tasks: [{ name: 'Task 1' }],
    });

    const runner = new WorkflowRunner(db, {
      spawnerConfig: createSpawnerConfig(wf.id),
    });

    const spawner = runner.getSpawner();
    expect(spawner).toBeDefined();
    expect(spawner.getStatus().workflowId).toBe(wf.id);
  });
});
