import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, taskService, workflowService } from '@caw/core';
import { clearRegistry } from './registry';
import { WorkflowSpawner } from './spawner.service';
import type { SpawnerConfig } from './types';

/**
 * Shared DB reference that the mock spawn reads/writes.
 * Set in beforeEach, cleared in afterEach.
 */
let mockDb: DatabaseType | null = null;

/**
 * Track spawned process count for assertions.
 */
let spawnCount = 0;

/**
 * Configurable delay (ms) for mock agent task completion.
 */
let mockDelay = 20;

/**
 * When true, mock agents will NOT auto-complete tasks (for suspend test).
 */
let suppressAutoComplete = false;

/**
 * Tracks task IDs that mock agents have started working on.
 */
const startedTaskIds = new Set<string>();

// ---- Mock spawn function (injected via config.spawnFn) ----

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
      // Delay close so AgentSession's readline loop finishes and attaches the listener
      setTimeout(() => proc.emit('close', 1), 10);
    },
  });

  // Extract taskId from the -p prompt argument
  const promptIdx = args.indexOf('-p');
  const promptArg = promptIdx >= 0 ? args[promptIdx + 1] : '';
  const taskIdMatch = promptArg.match(/tk_[0-9a-z]{12}/);
  const taskId = taskIdMatch?.[0] ?? null;

  if (taskId) {
    startedTaskIds.add(taskId);
  }

  const sessionId = `sess_${spawnCount}`;

  // Simulate async agent work
  setTimeout(() => {
    // Emit init message
    stdout.write(`${JSON.stringify({ type: 'system', subtype: 'init', session_id: sessionId })}\n`);

    if (suppressAutoComplete || !taskId || !mockDb) {
      // Don't auto-complete; wait for abort/kill
      return;
    }

    // Simulate task completion in DB: pending → planning → completed
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
        // Task may have been already transitioned
      }

      // Emit result message, then end stdout. Delay close so the readline
      // async iterator in AgentSession.run() finishes and attaches the
      // proc.on('close') listener before we emit.
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
    tasks: Array<{
      name: string;
      description?: string;
      depends_on?: string[];
      parallel_group?: string;
    }>;
  },
  maxParallel = 1,
) {
  const wf = workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'prompt',
    source_content: 'test',
    max_parallel_tasks: maxParallel,
  });
  workflowService.setPlan(db, wf.id, plan);
  return wf;
}

/**
 * Wait for a specific event on a spawner, with timeout.
 */
function waitForEvent(
  spawner: InstanceType<typeof WorkflowSpawner>,
  event: string,
  timeoutMs = 5000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for '${event}'`)),
      timeoutMs,
    );
    spawner.on(event as never, (data: unknown) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('spawner integration', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createTestDb();
    mockDb = db;
    spawnCount = 0;
    mockDelay = 20;
    suppressAutoComplete = false;
    startedTaskIds.clear();
  });

  afterEach(async () => {
    clearRegistry();
    mockDb = null;
  });

  describe('single task lifecycle', () => {
    it('creates workflow, starts spawner, completes task, emits workflow_all_complete', async () => {
      const wf = createWorkflowWithPlan(db, {
        summary: 'Single task plan',
        tasks: [{ name: 'Only Task', description: 'Do the thing' }],
      });

      const config = createSpawnerConfig(wf.id);
      const spawner = new WorkflowSpawner(db, config);

      const completePromise = waitForEvent(spawner, 'workflow_all_complete');

      const result = await spawner.start();
      expect(result.success).toBe(true);
      expect(result.agentHandles.length).toBe(1);

      const eventData = (await completePromise) as { workflowId: string };
      expect(eventData.workflowId).toBe(wf.id);

      // Verify final states
      const finalWf = workflowService.get(db, wf.id);
      expect(finalWf?.status).toBe('completed');

      const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as Array<{
        status: string;
      }>;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('completed');

      expect(spawnCount).toBe(1);

      await spawner.shutdown();
    });
  });

  describe('sequential dependencies (A → B)', () => {
    it('starts B only after A completes', async () => {
      const wf = createWorkflowWithPlan(db, {
        summary: 'Sequential plan',
        tasks: [
          { name: 'Task A', description: 'First' },
          { name: 'Task B', description: 'Second', depends_on: ['Task A'] },
        ],
      });

      const config = createSpawnerConfig(wf.id);
      const spawner = new WorkflowSpawner(db, config);

      const startedEvents: string[] = [];
      spawner.on('agent_started', (data) => {
        startedEvents.push(data.taskId);
      });

      const completePromise = waitForEvent(spawner, 'workflow_all_complete');

      const result = await spawner.start();
      expect(result.success).toBe(true);

      // Initially only one agent for Task A
      expect(result.agentHandles.length).toBe(1);

      await completePromise;

      // Verify both tasks completed
      const tasks = db
        .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
        .all(wf.id) as Array<{ name: string; status: string }>;

      expect(tasks).toHaveLength(2);
      expect(tasks[0].name).toBe('Task A');
      expect(tasks[0].status).toBe('completed');
      expect(tasks[1].name).toBe('Task B');
      expect(tasks[1].status).toBe('completed');

      // Both agents started (sequentially)
      expect(startedEvents).toHaveLength(2);

      // 2 processes spawned total
      expect(spawnCount).toBe(2);

      const finalWf = workflowService.get(db, wf.id);
      expect(finalWf?.status).toBe('completed');

      await spawner.shutdown();
    });
  });

  describe('parallel fan-in (A, B → C)', () => {
    it('runs A and B concurrently, then C after both complete', async () => {
      const wf = createWorkflowWithPlan(
        db,
        {
          summary: 'Parallel fan-in plan',
          tasks: [
            { name: 'Task A', description: 'Parallel 1', parallel_group: 'batch1' },
            { name: 'Task B', description: 'Parallel 2', parallel_group: 'batch1' },
            { name: 'Task C', description: 'Fan-in', depends_on: ['Task A', 'Task B'] },
          ],
        },
        3,
      );

      const config = createSpawnerConfig(wf.id, { maxAgents: 3 });
      const spawner = new WorkflowSpawner(db, config);

      const startedEvents: string[] = [];
      spawner.on('agent_started', (data) => {
        startedEvents.push(data.taskId);
      });

      const completePromise = waitForEvent(spawner, 'workflow_all_complete');

      const result = await spawner.start();
      expect(result.success).toBe(true);

      // Should spawn 2 agents initially (A and B in parallel)
      expect(result.agentHandles.length).toBe(2);

      await completePromise;

      // All 3 tasks completed
      const tasks = db
        .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
        .all(wf.id) as Array<{ name: string; status: string }>;

      expect(tasks).toHaveLength(3);
      for (const task of tasks) {
        expect(task.status).toBe('completed');
      }

      // 3 total agents spawned
      expect(spawnCount).toBe(3);

      const finalWf = workflowService.get(db, wf.id);
      expect(finalWf?.status).toBe('completed');

      await spawner.shutdown();
    });
  });

  describe('suspend and resume', () => {
    it('suspends running agents, pauses tasks, then resumes and completes', async () => {
      // Use slower mock delay so we can suspend mid-flight
      suppressAutoComplete = true;

      const wf = createWorkflowWithPlan(db, {
        summary: 'Suspend/resume plan',
        tasks: [
          { name: 'Task A', description: 'Will be suspended' },
          { name: 'Task B', description: 'After resume', depends_on: ['Task A'] },
        ],
      });

      const config = createSpawnerConfig(wf.id);
      const spawner = new WorkflowSpawner(db, config);

      const startResult = await spawner.start();
      expect(startResult.success).toBe(true);

      // Wait for agent to start
      await new Promise((r) => setTimeout(r, 50));

      // Verify workflow is in_progress
      let currentWf = workflowService.get(db, wf.id);
      expect(currentWf?.status).toBe('in_progress');

      // Suspend
      const suspendResult = await spawner.suspend();
      expect(suspendResult.success).toBe(true);
      expect(suspendResult.agentsStopped).toBeGreaterThanOrEqual(1);

      // Verify workflow is paused
      currentWf = workflowService.get(db, wf.id);
      expect(currentWf?.status).toBe('paused');

      // Verify status
      const status = spawner.getStatus();
      expect(status.status).toBe('suspended');

      // Now allow auto-completion and resume
      suppressAutoComplete = false;

      const completePromise = waitForEvent(spawner, 'workflow_all_complete');

      const resumeResult = await spawner.resume();
      expect(resumeResult.success).toBe(true);

      await completePromise;

      // All tasks done
      const tasks = db
        .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
        .all(wf.id) as Array<{ name: string; status: string }>;

      for (const task of tasks) {
        expect(task.status).toBe('completed');
      }

      const finalWf = workflowService.get(db, wf.id);
      expect(finalWf?.status).toBe('completed');

      await spawner.shutdown();
    });
  });
});
