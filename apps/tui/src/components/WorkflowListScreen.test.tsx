import { describe, expect, test } from 'bun:test';
import { WorkflowListScreen } from './WorkflowListScreen';

describe('WorkflowListScreen', () => {
  test('exports WorkflowListScreen as a function component', () => {
    expect(typeof WorkflowListScreen).toBe('function');
  });

  test('has the expected function name', () => {
    expect(WorkflowListScreen.name).toBe('WorkflowListScreen');
  });
});
