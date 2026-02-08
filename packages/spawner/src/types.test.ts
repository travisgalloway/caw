import { describe, expect, test } from 'bun:test';
import type {
  AgentHandle,
  ExecutionStatus,
  ResumeResult,
  SpawnerConfig,
  SpawnerMetadata,
  SpawnResult,
  SuspendResult,
} from './types';

describe('types', () => {
  test('SpawnerConfig shape', () => {
    const config: SpawnerConfig = {
      workflowId: 'wf_abc',
      maxAgents: 3,
      model: 'claude-sonnet-4-5',
      permissionMode: 'bypassPermissions',
      maxTurns: 50,
      mcpServerUrl: 'http://localhost:3100/mcp',
      cwd: '/tmp',
    };

    expect(config.workflowId).toBe('wf_abc');
    expect(config.maxAgents).toBe(3);
    expect(config.model).toBe('claude-sonnet-4-5');
  });

  test('AgentHandle shape', () => {
    const handle: AgentHandle = {
      agentId: 'ag_abc',
      taskId: 'tk_def',
      sessionId: null,
      status: 'starting',
      startedAt: Date.now(),
      completedAt: null,
      retryCount: 0,
      error: null,
    };

    expect(handle.agentId).toBe('ag_abc');
    expect(handle.status).toBe('starting');
    expect(handle.retryCount).toBe(0);
  });

  test('SpawnResult shape', () => {
    const result: SpawnResult = {
      success: true,
      agentHandles: [],
    };

    expect(result.success).toBe(true);
    expect(result.agentHandles).toEqual([]);
  });

  test('SuspendResult shape', () => {
    const result: SuspendResult = {
      success: true,
      agentsStopped: 2,
      tasksReleased: 3,
    };

    expect(result.agentsStopped).toBe(2);
    expect(result.tasksReleased).toBe(3);
  });

  test('ResumeResult shape', () => {
    const result: ResumeResult = {
      success: true,
      agentsSpawned: 1,
      tasksAvailable: 5,
    };

    expect(result.agentsSpawned).toBe(1);
    expect(result.tasksAvailable).toBe(5);
  });

  test('ExecutionStatus shape', () => {
    const status: ExecutionStatus = {
      workflowId: 'wf_abc',
      status: 'running',
      agents: [],
      progress: {
        totalTasks: 10,
        completed: 3,
        inProgress: 2,
        failed: 1,
        remaining: 4,
      },
      startedAt: Date.now(),
      suspendedAt: null,
    };

    expect(status.status).toBe('running');
    expect(status.progress.totalTasks).toBe(10);
    expect(status.progress.remaining).toBe(4);
  });

  test('SpawnerMetadata shape', () => {
    const meta: SpawnerMetadata = {
      spawner_id: 'sp_abc',
      max_agents: 3,
      model: 'claude-sonnet-4-5',
      permission_mode: 'bypassPermissions',
      started_at: Date.now(),
      suspended_at: null,
    };

    expect(meta.spawner_id).toStartWith('sp_');
    expect(meta.suspended_at).toBeNull();
  });

  test('AgentHandle status values', () => {
    const statuses: AgentHandle['status'][] = [
      'starting',
      'running',
      'completed',
      'failed',
      'aborted',
    ];
    expect(statuses).toHaveLength(5);
  });

  test('SpawnerConfig optional fields', () => {
    const config: SpawnerConfig = {
      workflowId: 'wf_abc',
      maxAgents: 1,
      model: 'claude-sonnet-4-5',
      permissionMode: 'acceptEdits',
      maxTurns: 10,
      maxBudgetUsd: 5.0,
      mcpServerUrl: 'http://localhost:3100/mcp',
      cwd: '/tmp',
    };

    expect(config.maxBudgetUsd).toBe(5.0);
  });
});
