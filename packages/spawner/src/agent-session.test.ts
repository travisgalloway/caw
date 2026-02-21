import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
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

  describe('worktreeName option', () => {
    function createMockSpawn() {
      let capturedArgs: string[] = [];
      let capturedCwd: string | undefined;

      const spawnFn = (_cmd: string, args: string[], opts: { cwd?: string }) => {
        capturedArgs = args;
        capturedCwd = opts.cwd as string;
        const proc = new EventEmitter() as EventEmitter & {
          stdout: Readable;
          stderr: Readable;
          stdin: null;
          pid: number;
          killed: boolean;
          kill: () => boolean;
        };
        proc.stdout = new Readable({ read() {} });
        proc.stderr = new Readable({ read() {} });
        proc.stdin = null;
        proc.pid = 12345;
        proc.killed = false;
        proc.kill = () => true;
        // End streams and emit close after a tick
        setTimeout(() => {
          proc.stdout.push(null);
          proc.stderr.push(null);
          setTimeout(() => proc.emit('close', 0), 10);
        }, 10);
        return proc;
      };

      return {
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        spawnFn: spawnFn as any,
        getArgs: () => capturedArgs,
        getCwd: () => capturedCwd,
      };
    }

    test('includes --worktree flag when worktreeName is set', async () => {
      const mock = createMockSpawn();
      const session = new AgentSession({
        ...defaultOptions,
        worktreeName: 'caw-tk_test456',
        config: { ...defaultOptions.config, spawnFn: mock.spawnFn },
      });

      await session.run();

      const args = mock.getArgs();
      const wtIdx = args.indexOf('--worktree');
      expect(wtIdx).toBeGreaterThan(-1);
      expect(args[wtIdx + 1]).toBe('caw-tk_test456');
    });

    test('uses main repo cwd when worktreeName is set (ignores cwdOverride)', async () => {
      const mock = createMockSpawn();
      const session = new AgentSession({
        ...defaultOptions,
        worktreeName: 'caw-tk_test456',
        cwdOverride: '/some/worktree/path',
        config: { ...defaultOptions.config, cwd: '/main/repo', spawnFn: mock.spawnFn },
      });

      await session.run();

      // Should use main repo cwd, not the worktree override
      expect(mock.getCwd()).toBe('/main/repo');
    });

    test('does not include --worktree flag when worktreeName is not set', async () => {
      const mock = createMockSpawn();
      const session = new AgentSession({
        ...defaultOptions,
        config: { ...defaultOptions.config, spawnFn: mock.spawnFn },
      });

      await session.run();

      const args = mock.getArgs();
      expect(args.indexOf('--worktree')).toBe(-1);
    });

    test('uses cwdOverride normally when worktreeName is not set', async () => {
      const mock = createMockSpawn();
      const session = new AgentSession({
        ...defaultOptions,
        cwdOverride: '/some/worktree/path',
        config: { ...defaultOptions.config, cwd: '/main/repo', spawnFn: mock.spawnFn },
      });

      await session.run();

      expect(mock.getCwd()).toBe('/some/worktree/path');
    });
  });
});
