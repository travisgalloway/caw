import { describe, expect, test } from 'bun:test';
import { ActiveWorkflows } from './ActiveWorkflows';

describe('ActiveWorkflows', () => {
  test('module exports ActiveWorkflows component', () => {
    expect(typeof ActiveWorkflows).toBe('function');
  });

  test('ActiveWorkflows has the expected function name', () => {
    expect(ActiveWorkflows.name).toBe('ActiveWorkflows');
  });
});
