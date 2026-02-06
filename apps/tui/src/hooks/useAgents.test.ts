import { describe, expect, test } from 'bun:test';
import { useAgents } from './useAgents';

describe('useAgents', () => {
  test('module exports useAgents function', () => {
    expect(typeof useAgents).toBe('function');
  });
});
