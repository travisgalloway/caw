import { describe, expect, test } from 'bun:test';
import { createConnection, runMigrations } from '@caw/core';
import { createMcpServer } from './server';
import { getRegisteredTools } from './tools/__test-utils';

describe('createMcpServer', () => {
  test('registers all 56 tools', () => {
    const db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);

    const tools = getRegisteredTools(server);
    expect(Object.keys(tools).length).toBe(56);
  });

  test('all tool names follow entity_action naming convention', () => {
    const db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);

    const tools = getRegisteredTools(server);
    const names = Object.keys(tools);

    for (const name of names) {
      expect(name).toMatch(/^[a-z]+(_[a-z]+)+$/);
    }
  });

  test('registered tool names match expected set', () => {
    const db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);

    const tools = getRegisteredTools(server);
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
    expect(names).toContain('workflow_add_repository');
    expect(names).toContain('workflow_remove_repository');
    expect(names).toContain('workflow_list_repositories');
    expect(names).toContain('workflow_add_task');
    expect(names).toContain('workflow_remove_task');
    expect(names).toContain('workflow_replan');
    expect(names).toContain('workflow_start');
    expect(names).toContain('workflow_suspend');
    expect(names).toContain('workflow_resume');
    expect(names).toContain('workflow_execution_status');
  });
});
