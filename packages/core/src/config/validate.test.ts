import { describe, expect, test } from 'bun:test';
import { validateConfig } from './validate';

describe('validateConfig', () => {
  test('returns empty config for empty object', () => {
    const result = validateConfig({});
    expect(result.valid).toBe(true);
    expect(result.config).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  test('accepts valid full config', () => {
    const result = validateConfig({
      transport: 'http',
      port: 3100,
      agent: { runtime: 'claude-code', autoSetup: true },
    });
    expect(result.valid).toBe(true);
    expect(result.config).toEqual({
      transport: 'http',
      port: 3100,
      agent: { runtime: 'claude-code', autoSetup: true },
    });
    expect(result.warnings).toEqual([]);
  });

  test('accepts stdio transport', () => {
    const result = validateConfig({ transport: 'stdio' });
    expect(result.valid).toBe(true);
    expect(result.config.transport).toBe('stdio');
  });

  test('warns on invalid transport', () => {
    const result = validateConfig({ transport: 'websocket' });
    expect(result.valid).toBe(false);
    expect(result.config.transport).toBeUndefined();
    expect(result.warnings[0]).toContain('Invalid transport');
  });

  test('accepts valid port', () => {
    const result = validateConfig({ port: 8080 });
    expect(result.valid).toBe(true);
    expect(result.config.port).toBe(8080);
  });

  test('warns on port 0', () => {
    const result = validateConfig({ port: 0 });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Invalid port');
  });

  test('warns on port > 65535', () => {
    const result = validateConfig({ port: 70000 });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Invalid port');
  });

  test('warns on non-integer port', () => {
    const result = validateConfig({ port: 3.14 });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Invalid port');
  });

  test('warns on string port', () => {
    const result = validateConfig({ port: '3100' });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Invalid port');
  });

  test('strips dbMode with deprecation warning', () => {
    const result = validateConfig({ dbMode: 'per-repo' });
    expect(result.valid).toBe(true);
    expect(result.config).toEqual({});
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("'dbMode' is deprecated");
  });

  test('strips dbMode and validates remaining fields', () => {
    const result = validateConfig({ dbMode: 'global', transport: 'http' });
    expect(result.valid).toBe(true);
    expect(result.config.transport).toBe('http');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("'dbMode' is deprecated");
  });

  test('warns on non-object agent', () => {
    const result = validateConfig({ agent: 'claude_code' });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Invalid agent');
  });

  test('warns on invalid agent.runtime', () => {
    const result = validateConfig({ agent: { runtime: 'codex' } });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('agent.runtime');
  });

  test('warns on non-boolean agent.autoSetup', () => {
    const result = validateConfig({ agent: { autoSetup: 'yes' } });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('agent.autoSetup');
  });

  test('accepts agent parallelism settings', () => {
    const result = validateConfig({
      agent: { maxParallelAgents: 10, agentsPerWorkflow: 3 },
    });
    expect(result.valid).toBe(true);
    expect(result.config.agent?.maxParallelAgents).toBe(10);
    expect(result.config.agent?.agentsPerWorkflow).toBe(3);
  });

  test('warns on out-of-range parallelism', () => {
    const result = validateConfig({
      agent: { maxParallelAgents: 100 },
    });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('agent.maxParallelAgents');
  });

  test('returns invalid for null input', () => {
    const result = validateConfig(null);
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('JSON object');
  });

  test('returns invalid for non-object input', () => {
    const result = validateConfig('string');
    expect(result.valid).toBe(false);
  });

  test('collects multiple warnings', () => {
    const result = validateConfig({ transport: 'bad', port: -1 });
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBe(2);
  });

  test('ignores unknown keys without warning', () => {
    const result = validateConfig({ unknownKey: 'value' });
    expect(result.valid).toBe(true);
    expect(result.config).toEqual({});
  });
});
