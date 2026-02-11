import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfigPaths, loadConfig, mergeConfigs, readConfigFile, writeConfig } from './loader';

describe('mergeConfigs', () => {
  test('returns empty config when no inputs', () => {
    expect(mergeConfigs()).toEqual({});
  });

  test('merges transport from later config', () => {
    const result = mergeConfigs({ transport: 'stdio' }, { transport: 'http' });
    expect(result.transport).toBe('http');
  });

  test('later config overrides port', () => {
    const result = mergeConfigs({ port: 3100 }, { port: 8080 });
    expect(result.port).toBe(8080);
  });

  test('preserves earlier values when later config omits them', () => {
    const result = mergeConfigs({ transport: 'http', port: 8080 }, { dbMode: 'global' });
    expect(result.transport).toBe('http');
    expect(result.port).toBe(8080);
    expect(result.dbMode).toBe('global');
  });

  test('deep merges agent config', () => {
    const result = mergeConfigs(
      { agent: { runtime: 'claude_code' } },
      { agent: { autoSetup: true } },
    );
    expect(result.agent).toEqual({ runtime: 'claude_code', autoSetup: true });
  });
});

describe('getConfigPaths', () => {
  test('returns global path without repo', () => {
    const paths = getConfigPaths();
    expect(paths.repo).toBeNull();
    expect(paths.global).toContain('.caw/config.json');
  });

  test('returns both paths with repo', () => {
    const paths = getConfigPaths('/my/repo');
    expect(paths.repo).toBe('/my/repo/.caw/config.json');
    expect(paths.global).toContain('.caw/config.json');
  });
});

describe('readConfigFile', () => {
  test('returns empty for non-existent file', () => {
    const result = readConfigFile('/does/not/exist.json');
    expect(result.config).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `caw-test-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reads valid config file', () => {
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ transport: 'http', port: 8080 }));
    const result = readConfigFile(configPath);
    expect(result.config.transport).toBe('http');
    expect(result.config.port).toBe(8080);
    expect(result.warnings).toEqual([]);
  });

  test('returns warnings for invalid JSON', () => {
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, 'not json');
    const result = readConfigFile(configPath);
    expect(result.config).toEqual({});
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('Failed to read config');
  });

  test('returns warnings for invalid config values', () => {
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ transport: 'bad' }));
    const result = readConfigFile(configPath);
    expect(result.config.transport).toBeUndefined();
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('Invalid transport');
  });
});

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `caw-test-load-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tmpDir, '.caw'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty config when no files exist', () => {
    const result = loadConfig('/nonexistent/path');
    expect(result.config).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  test('reads repo config', () => {
    const configPath = join(tmpDir, '.caw', 'config.json');
    writeFileSync(configPath, JSON.stringify({ transport: 'http' }));
    const result = loadConfig(tmpDir);
    expect(result.config.transport).toBe('http');
  });
});

describe('writeConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `caw-test-write-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes config to file', () => {
    const configPath = join(tmpDir, 'config.json');
    writeConfig(configPath, { transport: 'http', port: 8080 });
    const content = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.transport).toBe('http');
    expect(parsed.port).toBe(8080);
  });

  test('creates parent directories', () => {
    const configPath = join(tmpDir, 'deep', 'nested', 'config.json');
    writeConfig(configPath, { dbMode: 'global' });
    expect(existsSync(configPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(parsed.dbMode).toBe('global');
  });

  test('writes pretty-printed JSON with trailing newline', () => {
    const configPath = join(tmpDir, 'config.json');
    writeConfig(configPath, { transport: 'stdio' });
    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('\n');
    expect(content.endsWith('\n')).toBe(true);
  });
});
