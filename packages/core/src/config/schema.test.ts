import { describe, expect, test } from 'bun:test';
import { validateConfig } from './schema';

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
      dbMode: 'global',
      agent: { runtime: 'claude_code', autoSetup: true },
    });
    expect(result.valid).toBe(true);
    expect(result.config).toEqual({
      transport: 'http',
      port: 3100,
      dbMode: 'global',
      agent: { runtime: 'claude_code', autoSetup: true },
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

  test('accepts valid dbMode', () => {
    const result = validateConfig({ dbMode: 'repository' });
    expect(result.valid).toBe(true);
    expect(result.config.dbMode).toBe('repository');
  });

  test('warns on invalid dbMode', () => {
    const result = validateConfig({ dbMode: 'local' });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Invalid dbMode');
  });

  test('warns on non-object agent', () => {
    const result = validateConfig({ agent: 'claude_code' });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Invalid agent');
  });

  test('warns on non-string agent.runtime', () => {
    const result = validateConfig({ agent: { runtime: 123 } });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('agent.runtime');
  });

  test('warns on non-boolean agent.autoSetup', () => {
    const result = validateConfig({ agent: { autoSetup: 'yes' } });
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('agent.autoSetup');
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
    const result = validateConfig({ transport: 'bad', port: -1, dbMode: 'bad' });
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBe(3);
  });

  test('ignores unknown keys without warning', () => {
    const result = validateConfig({ unknownKey: 'value' });
    expect(result.valid).toBe(true);
    expect(result.config).toEqual({});
  });
});
