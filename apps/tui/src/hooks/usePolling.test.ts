import { describe, expect, test } from 'bun:test';
import { usePolling } from './usePolling';

describe('usePolling', () => {
  test('module exports usePolling function', () => {
    expect(typeof usePolling).toBe('function');
  });

  test('usePolling accepts fetcher and interval parameters', () => {
    // Verify the function signature: (fetcher, interval?) => result
    expect(usePolling).toBeDefined();
    expect(usePolling.length).toBeGreaterThanOrEqual(1);
  });
});
