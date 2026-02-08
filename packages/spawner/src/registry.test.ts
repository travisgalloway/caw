import { afterEach, describe, expect, test } from 'bun:test';
import {
  clearRegistry,
  getSpawner,
  listSpawners,
  registerSpawner,
  unregisterSpawner,
} from './registry';
import type { WorkflowSpawner } from './spawner.service';

describe('registry', () => {
  afterEach(() => {
    clearRegistry();
  });

  test('registerSpawner and getSpawner', () => {
    const mockSpawner = {} as WorkflowSpawner;
    registerSpawner('wf_abc', mockSpawner);
    expect(getSpawner('wf_abc')).toBe(mockSpawner);
  });

  test('getSpawner returns undefined for unknown workflow', () => {
    expect(getSpawner('wf_nonexistent')).toBeUndefined();
  });

  test('unregisterSpawner removes the entry', () => {
    const mockSpawner = {} as WorkflowSpawner;
    registerSpawner('wf_abc', mockSpawner);
    unregisterSpawner('wf_abc');
    expect(getSpawner('wf_abc')).toBeUndefined();
  });

  test('listSpawners returns all registered spawners', () => {
    const s1 = {} as WorkflowSpawner;
    const s2 = {} as WorkflowSpawner;
    registerSpawner('wf_1', s1);
    registerSpawner('wf_2', s2);

    const all = listSpawners();
    expect(all.size).toBe(2);
    expect(all.get('wf_1')).toBe(s1);
    expect(all.get('wf_2')).toBe(s2);
  });

  test('clearRegistry removes all entries', () => {
    registerSpawner('wf_1', {} as WorkflowSpawner);
    registerSpawner('wf_2', {} as WorkflowSpawner);
    clearRegistry();
    expect(listSpawners().size).toBe(0);
  });

  test('listSpawners returns a copy', () => {
    registerSpawner('wf_1', {} as WorkflowSpawner);
    const copy = listSpawners();
    copy.delete('wf_1');
    // Original should still have it
    expect(getSpawner('wf_1')).toBeDefined();
  });
});
