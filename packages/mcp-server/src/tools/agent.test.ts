import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import {
  agentService,
  createConnection,
  runMigrations,
  taskService,
  workflowService,
} from '@caw/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../server';
import { getToolHandler, parseContent, parseError } from './__test-utils';
import type { ToolErrorInfo } from './types';

describe('agent tools', () => {
  let db: DatabaseType;
  let call: (name: string, args: Record<string, unknown>) => CallToolResult;

  function registerAgent(name = 'Test Agent'): string {
    const result = call('agent_register', {
      name,
      runtime: 'claude_code',
    });
    return (parseContent(result) as { id: string }).id;
  }

  function createTask(): string {
    const wf = workflowService.create(db, {
      name: 'Test WF',
      source_type: 'prompt',
      source_content: 'test',
    });
    workflowService.setPlan(db, wf.id, {
      summary: 'plan',
      tasks: [{ name: 'Task 1' }],
    });
    const full = workflowService.get(db, wf.id, { includeTasks: true }) as NonNullable<
      ReturnType<typeof workflowService.get>
    >;
    return full.tasks[0].id;
  }

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);
    call = (name, args) => {
      const handler = getToolHandler(server, name);
      return handler(args) as CallToolResult;
    };
  });

  // --- agent_register ---

  describe('agent_register', () => {
    it('registers an agent and returns id + status', () => {
      const result = call('agent_register', {
        name: 'Worker 1',
        runtime: 'claude_code',
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string; name: string; status: string };
      expect(data.id).toMatch(/^ag_/);
      expect(data.name).toBe('Worker 1');
      expect(data.status).toBe('online');
    });
  });

  // --- agent_get ---

  describe('agent_get', () => {
    it('returns agent details', () => {
      const agentId = registerAgent();
      const result = call('agent_get', { id: agentId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string; name: string };
      expect(data.id).toBe(agentId);
    });

    it('returns AGENT_NOT_FOUND for missing agent', () => {
      const result = call('agent_get', { id: 'ag_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('AGENT_NOT_FOUND');
      expect(err.recoverable).toBe(false);
    });
  });

  // --- agent_heartbeat ---

  describe('agent_heartbeat', () => {
    it('sends heartbeat successfully', () => {
      const agentId = registerAgent();
      const result = call('agent_heartbeat', { agent_id: agentId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean; next_heartbeat_ms: number };
      expect(data.success).toBe(true);
      expect(data.next_heartbeat_ms).toBe(30000);
    });

    it('returns AGENT_NOT_FOUND for missing agent', () => {
      const result = call('agent_heartbeat', { agent_id: 'ag_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('AGENT_NOT_FOUND');
    });

    it('returns INVALID_STATE for offline agent', () => {
      const agentId = registerAgent();
      agentService.update(db, agentId, { status: 'offline' });

      const result = call('agent_heartbeat', { agent_id: agentId });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_STATE');
      expect(err.suggestion).toContain('Re-register');
    });
  });

  // --- agent_update ---

  describe('agent_update', () => {
    it('updates agent status', () => {
      const agentId = registerAgent();
      const result = call('agent_update', { id: agentId, status: 'busy' });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns AGENT_NOT_FOUND for missing agent', () => {
      const result = call('agent_update', { id: 'ag_nonexistent', status: 'busy' });
      const err = parseError(result);
      expect(err.code).toBe('AGENT_NOT_FOUND');
    });
  });

  // --- agent_unregister ---

  describe('agent_unregister', () => {
    it('unregisters an agent', () => {
      const agentId = registerAgent();
      const result = call('agent_unregister', { id: agentId });
      expect(result.isError).toBeUndefined();
    });

    it('returns AGENT_NOT_FOUND for missing agent', () => {
      const result = call('agent_unregister', { id: 'ag_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('AGENT_NOT_FOUND');
    });
  });

  // --- task_claim ---

  describe('task_claim', () => {
    it('claims a task for an agent', () => {
      const agentId = registerAgent();
      const taskId = createTask();

      const result = call('task_claim', { task_id: taskId, agent_id: agentId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns success false when already claimed by another agent', () => {
      const agent1 = registerAgent('Agent 1');
      const agent2 = registerAgent('Agent 2');
      const taskId = createTask();

      call('task_claim', { task_id: taskId, agent_id: agent1 });
      const result = call('task_claim', { task_id: taskId, agent_id: agent2 });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as {
        success: boolean;
        already_claimed_by: string;
      };
      expect(data.success).toBe(false);
      expect(data.already_claimed_by).toBe(agent1);
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const agentId = registerAgent();
      const result = call('task_claim', { task_id: 'tk_nonexistent', agent_id: agentId });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
    });

    it('returns INVALID_STATE for completed task', () => {
      const agentId = registerAgent();
      const taskId = createTask();
      taskService.updateStatus(db, taskId, 'planning');
      taskService.updateStatus(db, taskId, 'in_progress');
      taskService.updateStatus(db, taskId, 'completed', { outcome: 'Done' });

      const result = call('task_claim', { task_id: taskId, agent_id: agentId });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_STATE');
    });
  });

  // --- task_release ---

  describe('task_release', () => {
    it('releases a claimed task', () => {
      const agentId = registerAgent();
      const taskId = createTask();
      call('task_claim', { task_id: taskId, agent_id: agentId });

      const result = call('task_release', { task_id: taskId, agent_id: agentId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const agentId = registerAgent();
      const result = call('task_release', { task_id: 'tk_nonexistent', agent_id: agentId });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
    });

    it('returns NOT_CLAIMED for unclaimed task', () => {
      const agentId = registerAgent();
      const taskId = createTask();

      const result = call('task_release', { task_id: taskId, agent_id: agentId });
      const err = parseError(result);
      expect(err.code).toBe('NOT_CLAIMED');
    });

    it('returns NOT_ASSIGNED when releasing task claimed by another agent', () => {
      const agent1 = registerAgent('Agent 1');
      const agent2 = registerAgent('Agent 2');
      const taskId = createTask();
      call('task_claim', { task_id: taskId, agent_id: agent1 });

      const result = call('task_release', { task_id: taskId, agent_id: agent2 });
      const err = parseError(result);
      expect(err.code).toBe('NOT_ASSIGNED');
    });
  });

  // --- structured error format ---

  describe('structured error format', () => {
    it('includes all required fields in error responses', () => {
      const result = call('agent_get', { id: 'ag_missing' });
      expect(result.isError).toBe(true);

      const err = parseContent(result) as ToolErrorInfo;
      expect(err).toHaveProperty('code');
      expect(err).toHaveProperty('message');
      expect(err).toHaveProperty('recoverable');
      expect(err).toHaveProperty('suggestion');
      expect(typeof err.code).toBe('string');
      expect(typeof err.message).toBe('string');
      expect(typeof err.recoverable).toBe('boolean');
      expect(typeof err.suggestion).toBe('string');
    });
  });
});
