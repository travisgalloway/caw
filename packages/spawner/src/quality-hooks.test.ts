import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installQualityHooks, removeQualityHooks } from './quality-hooks';

const TEST_DIR = join(import.meta.dir, '__test_quality_hooks__');
const CLAUDE_DIR = join(TEST_DIR, '.claude');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');

describe('quality-hooks', () => {
  beforeEach(() => {
    mkdirSync(CLAUDE_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('installQualityHooks', () => {
    test('creates settings.json with Stop hook', () => {
      const cleanup = installQualityHooks(TEST_DIR, { preToolUseHook: false });

      expect(existsSync(SETTINGS_PATH)).toBe(true);
      const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.hooks.Stop).toHaveLength(1);
      expect(settings.hooks.Stop[0].type).toBe('command');
      expect(settings.hooks.Stop[0].command).toContain('bun run build');

      cleanup();
    });

    test('creates settings.json with PreToolUse hook', () => {
      const cleanup = installQualityHooks(TEST_DIR, { stopHook: false });

      const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(settings.hooks.PreToolUse[0].matcher).toBe('Bash');

      cleanup();
    });

    test('preserves existing settings', () => {
      writeFileSync(SETTINGS_PATH, JSON.stringify({ myKey: 'myValue' }));

      const cleanup = installQualityHooks(TEST_DIR, { preToolUseHook: false });

      const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.myKey).toBe('myValue');
      expect(settings.hooks.Stop).toHaveLength(1);

      cleanup();

      // Verify restore
      const restored = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(restored.myKey).toBe('myValue');
      expect(restored.hooks).toBeUndefined();
    });

    test('cleanup removes settings if it did not exist before', () => {
      // Remove settings file
      if (existsSync(SETTINGS_PATH)) rmSync(SETTINGS_PATH);

      const cleanup = installQualityHooks(TEST_DIR);
      expect(existsSync(SETTINGS_PATH)).toBe(true);

      cleanup();
      expect(existsSync(SETTINGS_PATH)).toBe(false);
    });

    test('uses custom stop command', () => {
      const cleanup = installQualityHooks(TEST_DIR, {
        stopHookCommand: 'npm test',
        preToolUseHook: false,
      });

      const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.hooks.Stop[0].command).toContain('npm test');

      cleanup();
    });
  });

  describe('removeQualityHooks', () => {
    test('removes caw hooks while preserving others', () => {
      const settings = {
        hooks: {
          Stop: [
            { type: 'command', command: 'echo "__caw_quality_gate__" && test' },
            { type: 'command', command: 'echo "user hook"' },
          ],
        },
      };
      writeFileSync(SETTINGS_PATH, JSON.stringify(settings));

      removeQualityHooks(TEST_DIR);

      const result = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(result.hooks.Stop).toHaveLength(1);
      expect(result.hooks.Stop[0].command).toBe('echo "user hook"');
    });

    test('is a no-op if no settings file', () => {
      if (existsSync(SETTINGS_PATH)) rmSync(SETTINGS_PATH);
      removeQualityHooks(TEST_DIR); // Should not throw
    });
  });
});
