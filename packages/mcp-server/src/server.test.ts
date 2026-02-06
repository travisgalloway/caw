import { describe, expect, test } from 'bun:test';
import { createConnection, runMigrations } from '@caw/core';
import { createMcpServer } from './server';

describe('createMcpServer', () => {
  test('registers all 46 tools', () => {
    const db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
    const tools = (server as any)._registeredTools as Record<string, unknown>;
    expect(Object.keys(tools).length).toBe(46);
  });

  test('registered tool names match expected set', () => {
    const db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
    const tools = (server as any)._registeredTools as Record<string, unknown>;
    const names = Object.keys(tools).sort();

    expect(names).toContain('workflow_create');
    expect(names).toContain('task_get');
    expect(names).toContain('checkpoint_add');
    expect(names).toContain('task_load_context');
    expect(names).toContain('workflow_next_tasks');
    expect(names).toContain('workspace_create');
    expect(names).toContain('repository_register');
    expect(names).toContain('template_create');
    expect(names).toContain('agent_register');
    expect(names).toContain('task_claim');
    expect(names).toContain('message_send');
    expect(names).toContain('message_count_unread');
  });
});
