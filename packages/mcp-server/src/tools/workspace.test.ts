import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, workflowService, workspaceService } from '@caw/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../server';
import type { ToolErrorInfo } from './types';

type ToolHandler = (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;

function getToolHandler(server: unknown, name: string): ToolHandler {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
  const tools = (server as any)._registeredTools as Record<string, { handler: ToolHandler }>;
  return tools[name].handler;
}

function parseContent(result: CallToolResult): unknown {
  const text = result.content[0];
  if (text.type !== 'text') throw new Error('Expected text content');
  return JSON.parse(text.text);
}

function parseError(result: CallToolResult): ToolErrorInfo {
  expect(result.isError).toBe(true);
  return parseContent(result) as ToolErrorInfo;
}

describe('workspace tools', () => {
  let db: DatabaseType;
  let call: (name: string, args: Record<string, unknown>) => CallToolResult;

  function createWorkflowWithTask(): { workflowId: string; taskId: string } {
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
    return { workflowId: wf.id, taskId: full.tasks[0].id };
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

  // --- workspace_create ---

  describe('workspace_create', () => {
    it('creates a workspace and returns id', () => {
      const { workflowId } = createWorkflowWithTask();
      const result = call('workspace_create', {
        workflow_id: workflowId,
        path: '/tmp/ws1',
        branch: 'feat/task1',
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string };
      expect(data.id).toMatch(/^ws_/);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workspace_create', {
        workflow_id: 'wf_nonexistent',
        path: '/tmp/ws1',
        branch: 'feat/task1',
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });
  });

  // --- workspace_update ---

  describe('workspace_update', () => {
    it('updates workspace status', () => {
      const { workflowId } = createWorkflowWithTask();
      const ws = workspaceService.create(db, {
        workflowId,
        path: '/tmp/ws1',
        branch: 'feat/task1',
      });

      const result = call('workspace_update', {
        id: ws.id,
        status: 'abandoned',
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns WORKSPACE_NOT_FOUND for missing workspace', () => {
      const result = call('workspace_update', {
        id: 'ws_nonexistent',
        status: 'abandoned',
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKSPACE_NOT_FOUND');
    });

    it('returns MISSING_MERGE_COMMIT when merging without commit', () => {
      const { workflowId } = createWorkflowWithTask();
      const ws = workspaceService.create(db, {
        workflowId,
        path: '/tmp/ws1',
        branch: 'feat/task1',
      });

      const result = call('workspace_update', {
        id: ws.id,
        status: 'merged',
      });
      const err = parseError(result);
      expect(err.code).toBe('MISSING_MERGE_COMMIT');
      expect(err.recoverable).toBe(true);
    });

    it('successfully merges with commit', () => {
      const { workflowId } = createWorkflowWithTask();
      const ws = workspaceService.create(db, {
        workflowId,
        path: '/tmp/ws1',
        branch: 'feat/task1',
      });

      const result = call('workspace_update', {
        id: ws.id,
        status: 'merged',
        merge_commit: 'abc123',
      });
      expect(result.isError).toBeUndefined();
    });
  });

  // --- workspace_list ---

  describe('workspace_list', () => {
    it('returns empty list when no workspaces', () => {
      const { workflowId } = createWorkflowWithTask();
      const result = call('workspace_list', { workflow_id: workflowId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { workspaces: unknown[] };
      expect(data.workspaces).toEqual([]);
    });

    it('returns created workspaces', () => {
      const { workflowId } = createWorkflowWithTask();
      workspaceService.create(db, {
        workflowId,
        path: '/tmp/ws1',
        branch: 'feat/task1',
      });

      const result = call('workspace_list', { workflow_id: workflowId });
      const data = parseContent(result) as { workspaces: { id: string }[] };
      expect(data.workspaces).toHaveLength(1);
    });
  });

  // --- task_assign_workspace ---

  describe('task_assign_workspace', () => {
    it('assigns a task to a workspace', () => {
      const { workflowId, taskId } = createWorkflowWithTask();
      const ws = workspaceService.create(db, {
        workflowId,
        path: '/tmp/ws1',
        branch: 'feat/task1',
      });

      const result = call('task_assign_workspace', {
        task_id: taskId,
        workspace_id: ws.id,
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const { workflowId } = createWorkflowWithTask();
      const ws = workspaceService.create(db, {
        workflowId,
        path: '/tmp/ws1',
        branch: 'feat/task1',
      });

      const result = call('task_assign_workspace', {
        task_id: 'tk_nonexistent',
        workspace_id: ws.id,
      });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
    });

    it('returns WORKSPACE_NOT_FOUND for missing workspace', () => {
      const { taskId } = createWorkflowWithTask();
      const result = call('task_assign_workspace', {
        task_id: taskId,
        workspace_id: 'ws_nonexistent',
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKSPACE_NOT_FOUND');
    });

    it('returns INVALID_STATE for non-active workspace', () => {
      const { workflowId, taskId } = createWorkflowWithTask();
      const ws = workspaceService.create(db, {
        workflowId,
        path: '/tmp/ws1',
        branch: 'feat/task1',
      });
      workspaceService.update(db, ws.id, { status: 'abandoned' });

      const result = call('task_assign_workspace', {
        task_id: taskId,
        workspace_id: ws.id,
      });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_STATE');
    });
  });
});
