import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupClaudeCode } from './setup-claude-code';

describe('setupClaudeCode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `caw-test-setup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates .claude/settings.json with MCP entry', () => {
    const result = setupClaudeCode({ repoPath: tmpDir });
    expect(result.mcpConfigured).toBe(true);

    const settingsPath = join(tmpDir, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers.caw).toBeDefined();
    expect(settings.mcpServers.caw.args).toContain('--server');
  });

  test('merges into existing .claude/settings.json', () => {
    const settingsDir = join(tmpDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, 'settings.json'),
      JSON.stringify({ mcpServers: { other: { command: 'other' } }, someKey: 'value' }),
    );

    setupClaudeCode({ repoPath: tmpDir });

    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf-8'));
    expect(settings.mcpServers.caw).toBeDefined();
    expect(settings.mcpServers.other).toEqual({ command: 'other' });
    expect(settings.someKey).toBe('value');
  });

  test('creates CLAUDE.md if it does not exist', () => {
    const result = setupClaudeCode({ repoPath: tmpDir });
    expect(result.claudeMdUpdated).toBe(true);

    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('## Workflow Persistence (caw)');
  });

  test('appends to existing CLAUDE.md', () => {
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# My Project\n\nSome content.\n');

    setupClaudeCode({ repoPath: tmpDir });

    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('## Workflow Persistence (caw)');
  });

  test('skips CLAUDE.md if section already exists', () => {
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '## Workflow Persistence (caw)\nAlready here.\n');

    const result = setupClaudeCode({ repoPath: tmpDir });
    expect(result.claudeMdUpdated).toBe(false);
    expect(result.messages.some((m) => m.includes('already contains'))).toBe(true);
  });

  test('printOnly does not write files', () => {
    const result = setupClaudeCode({ repoPath: tmpDir, printOnly: true });
    expect(result.mcpConfigured).toBe(false);
    expect(result.claudeMdUpdated).toBe(false);
    expect(existsSync(join(tmpDir, '.claude', 'settings.json'))).toBe(false);
    expect(existsSync(join(tmpDir, 'CLAUDE.md'))).toBe(false);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  test('mcpOnly skips CLAUDE.md', () => {
    const result = setupClaudeCode({ repoPath: tmpDir, mcpOnly: true });
    expect(result.mcpConfigured).toBe(true);
    expect(result.claudeMdUpdated).toBe(false);
    expect(existsSync(join(tmpDir, 'CLAUDE.md'))).toBe(false);
  });

  test('claudeMdOnly skips MCP config', () => {
    const result = setupClaudeCode({ repoPath: tmpDir, claudeMdOnly: true });
    expect(result.mcpConfigured).toBe(false);
    expect(result.claudeMdUpdated).toBe(true);
    expect(existsSync(join(tmpDir, '.claude', 'settings.json'))).toBe(false);
  });

  test('idempotent — running twice does not duplicate', () => {
    setupClaudeCode({ repoPath: tmpDir });
    const result = setupClaudeCode({ repoPath: tmpDir });

    const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf-8'));
    expect(Object.keys(settings.mcpServers)).toEqual(['caw']);

    expect(result.claudeMdUpdated).toBe(false);
  });
});
