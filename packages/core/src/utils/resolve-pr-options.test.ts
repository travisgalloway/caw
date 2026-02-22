import { describe, expect, test } from 'bun:test';
import { resolveCycleMode } from './resolve-pr-options';

describe('resolveCycleMode', () => {
  test('returns default off when no sources provided', () => {
    expect(resolveCycleMode(undefined, null, null, null)).toBe('off');
  });

  test('CLI flag takes highest priority', () => {
    const workspace = { config: JSON.stringify({ pr: { cycle: 'hitl' } }) };
    const workflow = { config: JSON.stringify({ pr: { cycle: 'off' } }) };
    const fileConfig = { pr: { cycle: 'off' as const } };

    expect(resolveCycleMode('auto', workspace, workflow, fileConfig)).toBe('auto');
  });

  test('workspace config takes priority over workflow and file config', () => {
    const workspace = { config: JSON.stringify({ pr: { cycle: 'hitl' } }) };
    const workflow = { config: JSON.stringify({ pr: { cycle: 'off' } }) };
    const fileConfig = { pr: { cycle: 'auto' as const } };

    expect(resolveCycleMode(undefined, workspace, workflow, fileConfig)).toBe('hitl');
  });

  test('workflow config takes priority over file config', () => {
    const workflow = { config: JSON.stringify({ pr: { cycle: 'auto' } }) };
    const fileConfig = { pr: { cycle: 'hitl' as const } };

    expect(resolveCycleMode(undefined, null, workflow, fileConfig)).toBe('auto');
  });

  test('file config is used when no higher-priority source', () => {
    const fileConfig = { pr: { cycle: 'hitl' as const } };

    expect(resolveCycleMode(undefined, null, null, fileConfig)).toBe('hitl');
  });

  test('handles null config fields gracefully', () => {
    const workspace = { config: null };
    const workflow = { config: null };

    expect(resolveCycleMode(undefined, workspace, workflow, undefined)).toBe('off');
  });

  test('handles invalid JSON in config gracefully', () => {
    const workspace = { config: 'not-json' };

    expect(resolveCycleMode(undefined, workspace, null, null)).toBe('off');
  });

  test('handles config without pr.cycle key', () => {
    const workspace = { config: JSON.stringify({ other: 'value' }) };
    const workflow = { config: JSON.stringify({ pr: {} }) };

    expect(resolveCycleMode(undefined, workspace, workflow, null)).toBe('off');
  });

  test('handles invalid cycle value in config', () => {
    const workspace = { config: JSON.stringify({ pr: { cycle: 'invalid' } }) };

    expect(resolveCycleMode(undefined, workspace, null, null)).toBe('off');
  });

  test('skips undefined workspace and workflow', () => {
    const fileConfig = { pr: { cycle: 'auto' as const } };

    expect(resolveCycleMode(undefined, undefined, undefined, fileConfig)).toBe('auto');
  });
});
