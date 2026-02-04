import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, workflowService } from '@caw/core';
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

describe('context tools', () => {
  let db: DatabaseType;
  let call: (name: string, args: Record<string, unknown>) => CallToolResult;

  function createTask(): string {
    const wf = workflowService.create(db, {
      name: 'Test WF',
      source_type: 'prompt',
      source_content: 'test content',
    });
    workflowService.setPlan(db, wf.id, {
      summary: 'Test plan',
      tasks: [{ name: 'Task 1', description: 'A task' }],
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

  // --- task_load_context ---

  describe('task_load_context', () => {
    it('loads context for a task', () => {
      const taskId = createTask();
      const result = call('task_load_context', { task_id: taskId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { token_estimate: number };
      expect(data.token_estimate).toBeGreaterThan(0);
    });

    it('includes workflow context by default', () => {
      const taskId = createTask();
      const result = call('task_load_context', { task_id: taskId });
      const data = parseContent(result) as { workflow: { name: string } | undefined };
      expect(data.workflow).toBeDefined();
      expect((data.workflow as { name: string }).name).toBe('Test WF');
    });

    it('respects include flags', () => {
      const taskId = createTask();
      const result = call('task_load_context', {
        task_id: taskId,
        include: {
          workflow_plan: false,
          workflow_summary: false,
          prior_task_outcomes: false,
          sibling_status: false,
          dependency_outcomes: false,
        },
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { token_estimate: number };
      expect(data.token_estimate).toBeGreaterThan(0);
    });

    it('returns token_estimate', () => {
      const taskId = createTask();
      const result = call('task_load_context', { task_id: taskId, max_tokens: 4000 });
      const data = parseContent(result) as { token_estimate: number };
      expect(typeof data.token_estimate).toBe('number');
      expect(data.token_estimate).toBeGreaterThan(0);
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const result = call('task_load_context', { task_id: 'tk_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
      expect(err.recoverable).toBe(false);
    });
  });
});
