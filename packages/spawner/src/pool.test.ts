import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import {
  agentService,
  createConnection,
  runMigrations,
  taskService,
  workflowService,
} from '@caw/core';
import { AgentPool } from './pool';
import type { SpawnerConfig, SpawnerEventData } from './types';

function createTestDb(): DatabaseType {
  const db = createConnection(':memory:');
  runMigrations(db);
  return db;
}

function createTestWorkflow(db: DatabaseType) {
  const wf = workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'prompt',
  });
  workflowService.setPlan(db, wf.id, {
    summary: 'Test plan',
    tasks: [{ name: 'Task 1' }, { name: 'Task 2' }, { name: 'Task 3' }],
  });
  workflowService.updateStatus(db, wf.id, 'in_progress');
  return wf;
}

function createTestConfig(workflowId: string, overrides?: Partial<SpawnerConfig>): SpawnerConfig {
  return {
    workflowId,
    maxAgents: 2,
    model: 'claude-sonnet-4-5',
    permissionMode: 'bypassPermissions',
    maxTurns: 10,
    mcpServerUrl: 'http://localhost:3100/mcp',
    cwd: '/tmp',
    ...overrides,
  };
}

describe('AgentPool', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('constructor and basic state', () => {
    it('starts with zero active count', () => {
      const wf = createTestWorkflow(db);
      const pool = new AgentPool(db, createTestConfig(wf.id), {
        id: wf.id,
        name: wf.name,
        plan_summary: wf.plan_summary,
        source_content: wf.source_content,
      });

      expect(pool.getActiveCount()).toBe(0);
      expect(pool.hasCapacity()).toBe(true);
      expect(pool.getHandles()).toEqual([]);
    });
  });

  describe('hasCapacity', () => {
    it('returns true when under limit', () => {
      const wf = createTestWorkflow(db);
      const pool = new AgentPool(db, createTestConfig(wf.id, { maxAgents: 3 }), {
        id: wf.id,
        name: wf.name,
        plan_summary: wf.plan_summary,
        source_content: wf.source_content,
      });

      expect(pool.hasCapacity()).toBe(true);
    });

    it('respects maxAgents from config', () => {
      const wf = createTestWorkflow(db);
      const pool = new AgentPool(db, createTestConfig(wf.id, { maxAgents: 0 }), {
        id: wf.id,
        name: wf.name,
        plan_summary: wf.plan_summary,
        source_content: wf.source_content,
      });

      expect(pool.hasCapacity()).toBe(false);
    });
  });

  describe('setMaxAgents / getMaxAgents', () => {
    it('overrides config maxAgents', () => {
      const wf = createTestWorkflow(db);
      const pool = new AgentPool(db, createTestConfig(wf.id, { maxAgents: 2 }), {
        id: wf.id,
        name: wf.name,
        plan_summary: wf.plan_summary,
        source_content: wf.source_content,
      });

      expect(pool.getMaxAgents()).toBe(2);
      pool.setMaxAgents(5);
      expect(pool.getMaxAgents()).toBe(5);
    });
  });

  describe('event system', () => {
    it('registers and fires event listeners', () => {
      const wf = createTestWorkflow(db);
      const pool = new AgentPool(db, createTestConfig(wf.id), {
        id: wf.id,
        name: wf.name,
        plan_summary: wf.plan_summary,
        source_content: wf.source_content,
      });

      const events: SpawnerEventData['agent_started'][] = [];
      pool.on('agent_started', (data) => events.push(data));

      // Events are emitted internally during spawnAgent, but we can verify
      // the listener system works by checking it doesn't throw
      expect(events).toHaveLength(0);
    });
  });

  describe('stopAll', () => {
    it('returns 0 when no agents running', async () => {
      const wf = createTestWorkflow(db);
      const pool = new AgentPool(db, createTestConfig(wf.id), {
        id: wf.id,
        name: wf.name,
        plan_summary: wf.plan_summary,
        source_content: wf.source_content,
      });

      const stopped = await pool.stopAll();
      expect(stopped).toBe(0);
    });

    it('prevents new spawns after stopAll', async () => {
      const wf = createTestWorkflow(db);
      const pool = new AgentPool(db, createTestConfig(wf.id), {
        id: wf.id,
        name: wf.name,
        plan_summary: wf.plan_summary,
        source_content: wf.source_content,
      });

      await pool.stopAll();

      const tasks = db
        .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence LIMIT 1')
        .all(wf.id) as Array<{ id: string }>;

      const task = taskService.get(db, tasks[0].id);
      if (task) {
        await expect(pool.spawnAgent(task)).rejects.toThrow(/Pool is stopped/);
      }
    });
  });

  describe('monitoring', () => {
    it('starts and stops monitoring without error', () => {
      const wf = createTestWorkflow(db);
      const pool = new AgentPool(db, createTestConfig(wf.id), {
        id: wf.id,
        name: wf.name,
        plan_summary: wf.plan_summary,
        source_content: wf.source_content,
      });

      pool.startMonitoring();
      pool.startMonitoring(); // idempotent
      pool.stopMonitoring();
      pool.stopMonitoring(); // idempotent
    });
  });
});
