import { describe, expect, test } from 'bun:test';
import { useCommandHandler } from './useCommandHandler';

describe('useCommandHandler', () => {
  test('exports useCommandHandler as a function', () => {
    expect(typeof useCommandHandler).toBe('function');
  });
});
