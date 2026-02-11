import { describe, expect, test } from 'bun:test';
import type { AgentSessionOptions } from './agent-session';
import { AgentSession } from './agent-session';

describe('AgentSession', () => {
  const defaultOptions: AgentSessionOptions = {
    agentId: 'ag_test123',
    taskId: 'tk_test456',
    systemPrompt: 'You are a test agent',
    config: {
      workflowId: 'wf_abc',
      maxAgents: 3,
      model: 'claude-sonnet-4-5',
      permissionMode: 'bypassPermissions',
      maxTurns: 10,
      mcpServerUrl: 'http://localhost:3100/mcp',
      cwd: '/tmp',
    },
  };

  test('constructor sets initial state', () => {
    const session = new AgentSession(defaultOptions);

    expect(session.agentId).toBe('ag_test123');
    expect(session.taskId).toBe('tk_test456');
    expect(session.isRunning()).toBe(false);
  });

  test('getHandle returns a copy with initial values', () => {
    const session = new AgentSession(defaultOptions);
    const handle = session.getHandle();

    expect(handle.agentId).toBe('ag_test123');
    expect(handle.taskId).toBe('tk_test456');
    expect(handle.sessionId).toBeNull();
    expect(handle.status).toBe('starting');
    expect(handle.completedAt).toBeNull();
    expect(handle.retryCount).toBe(0);
    expect(handle.error).toBeNull();
    expect(handle.startedAt).toBeGreaterThan(0);
  });

  test('getHandle returns a different object each time', () => {
    const session = new AgentSession(defaultOptions);
    const handle1 = session.getHandle();
    const handle2 = session.getHandle();

    expect(handle1).not.toBe(handle2);
    expect(handle1).toEqual(handle2);
  });

  test('abort does not throw on fresh session', () => {
    const session = new AgentSession(defaultOptions);
    expect(() => session.abort()).not.toThrow();
  });

  test('abort sets status to aborted', () => {
    const session = new AgentSession(defaultOptions);
    session.abort();
    const handle = session.getHandle();
    expect(handle.status).toBe('aborted');
    expect(handle.error).toBe('Aborted');
  });
});
