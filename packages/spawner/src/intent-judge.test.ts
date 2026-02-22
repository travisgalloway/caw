import { describe, expect, test } from 'bun:test';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { runIntentJudge } from './intent-judge';

function createMockProcess(stdout: string, exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = Readable.from([stdout]) as ChildProcess['stdout'];
  proc.stderr = Readable.from(['']) as ChildProcess['stderr'];
  (proc as unknown as Record<string, unknown>).killed = false;
  (proc as unknown as Record<string, unknown>).pid = 123;
  proc.kill = () => true;

  setTimeout(() => proc.emit('close', exitCode), 10);
  return proc;
}

function createMockSpawnFn(responses: Map<string, { stdout: string; exitCode: number }>) {
  return (command: string, _args: string[], _options: SpawnOptions) => {
    const key = command === 'git' ? 'git' : 'claude';
    const response = responses.get(key) ?? { stdout: '', exitCode: 0 };
    return createMockProcess(response.stdout, response.exitCode);
  };
}

describe('runIntentJudge', () => {
  test('returns null when diff is empty', async () => {
    const spawnFn = createMockSpawnFn(new Map([['git', { stdout: '', exitCode: 0 }]]));

    const result = await runIntentJudge('Add a button', 'Added a button to the UI', {
      spawnFn: spawnFn as never,
    });

    expect(result).toBeNull();
  });

  test('returns null when git diff fails', async () => {
    const spawnFn = createMockSpawnFn(new Map([['git', { stdout: '', exitCode: 128 }]]));

    const result = await runIntentJudge('Add a button', 'Added a button to the UI', {
      spawnFn: spawnFn as never,
    });

    expect(result).toBeNull();
  });

  test('parses pass verdict correctly', async () => {
    const judgeOutput =
      'Analysis: The diff matches the task.\n{"verdict":"pass","confidence":0.95,"reason":"Changes align with requirements","scope_creep":[],"missing_requirements":[]}';

    const spawnFn = createMockSpawnFn(
      new Map([
        ['git', { stdout: 'diff --git a/file.ts b/file.ts\n+const x = 1;', exitCode: 0 }],
        ['claude', { stdout: judgeOutput, exitCode: 0 }],
      ]),
    );

    const result = await runIntentJudge('Add a constant', 'Added const x = 1', {
      spawnFn: spawnFn as never,
    });

    expect(result).not.toBeNull();
    expect(result?.verdict).toBe('pass');
    expect(result?.confidence).toBe(0.95);
    expect(result?.scopeCreep).toEqual([]);
    expect(result?.missingRequirements).toEqual([]);
  });

  test('parses fail verdict with issues', async () => {
    const judgeOutput =
      '{"verdict":"fail","confidence":0.8,"reason":"Missing test coverage","scope_creep":["unrelated refactoring"],"missing_requirements":["unit tests"]}';

    const spawnFn = createMockSpawnFn(
      new Map([
        ['git', { stdout: 'diff --git a/file.ts b/file.ts\n+code', exitCode: 0 }],
        ['claude', { stdout: judgeOutput, exitCode: 0 }],
      ]),
    );

    const result = await runIntentJudge('Add feature with tests', 'Added feature', {
      spawnFn: spawnFn as never,
    });

    expect(result).not.toBeNull();
    expect(result?.verdict).toBe('fail');
    expect(result?.confidence).toBe(0.8);
    expect(result?.scopeCreep).toEqual(['unrelated refactoring']);
    expect(result?.missingRequirements).toEqual(['unit tests']);
  });

  test('clamps confidence to [0, 1]', async () => {
    const judgeOutput =
      '{"verdict":"pass","confidence":1.5,"reason":"ok","scope_creep":[],"missing_requirements":[]}';

    const spawnFn = createMockSpawnFn(
      new Map([
        ['git', { stdout: 'diff --git a/file.ts b/file.ts\n+code', exitCode: 0 }],
        ['claude', { stdout: judgeOutput, exitCode: 0 }],
      ]),
    );

    const result = await runIntentJudge('task', 'done', { spawnFn: spawnFn as never });
    expect(result?.confidence).toBe(1);
  });
});
