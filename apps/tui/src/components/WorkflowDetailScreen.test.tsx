import { describe, expect, test } from 'bun:test';
import { WorkflowDetailScreen } from './WorkflowDetailScreen';

describe('WorkflowDetailScreen', () => {
  test('exports WorkflowDetailScreen as a function component', () => {
    expect(typeof WorkflowDetailScreen).toBe('function');
  });

  test('has the expected function name', () => {
    expect(WorkflowDetailScreen.name).toBe('WorkflowDetailScreen');
  });
});
