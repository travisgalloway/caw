import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('init command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `caw-test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    // Create a .gitignore so ensureGitignore doesn't fail
    const gitignorePath = join(tempDir, '.gitignore');
    const { writeFileSync } = require('node:fs');
    writeFileSync(gitignorePath, 'node_modules/\n', 'utf-8');
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  });

  it('runNonInteractive creates config file with defaults', async () => {
    // Import the module dynamically to test the non-interactive path
    const { runInit } = await import('./init');

    // Use a subdirectory so we don't pollute the temp dir
    const configDir = join(tempDir, '.caw');

    // Run with --yes (non-interactive)
    // This writes to the filesystem
    await runInit({
      yes: true,
      repoPath: tempDir,
    });

    const configPath = join(configDir, 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config).toBeDefined();
  });

  it('creates templates directory', async () => {
    const { runInit } = await import('./init');

    await runInit({
      yes: true,
      repoPath: tempDir,
    });

    const templatesDir = join(tempDir, '.caw', 'templates');
    expect(existsSync(templatesDir)).toBe(true);
  });

  it('is idempotent — running twice does not error', async () => {
    const { runInit } = await import('./init');

    await runInit({ yes: true, repoPath: tempDir });
    await runInit({ yes: true, repoPath: tempDir });

    const configPath = join(tempDir, '.caw', 'config.json');
    expect(existsSync(configPath)).toBe(true);
  });

  it('adds .caw/ to .gitignore', async () => {
    const { runInit } = await import('./init');

    await runInit({ yes: true, repoPath: tempDir });

    const gitignorePath = join(tempDir, '.gitignore');
    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.caw/');
  });
});
