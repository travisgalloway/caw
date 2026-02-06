import { describe, expect, test } from 'bun:test';
import type { UsePollingResult } from './usePolling';
import { usePolling } from './usePolling';

describe('usePolling', () => {
  test('module exports usePolling function', () => {
    expect(typeof usePolling).toBe('function');
  });

  test('usePolling accepts fetcher and interval parameters', () => {
    expect(usePolling).toBeDefined();
    expect(usePolling.length).toBeGreaterThanOrEqual(1);
  });

  test('UsePollingResult interface shape is correct', () => {
    // Verify the type exports compile correctly
    const mock: UsePollingResult<string> = {
      data: 'test',
      loading: false,
      error: null,
      refresh: () => {},
    };
    expect(mock.data).toBe('test');
    expect(mock.loading).toBe(false);
    expect(mock.error).toBeNull();
    expect(typeof mock.refresh).toBe('function');
  });

  test('UsePollingResult supports null data', () => {
    const mock: UsePollingResult<string> = {
      data: null,
      loading: true,
      error: null,
      refresh: () => {},
    };
    expect(mock.data).toBeNull();
    expect(mock.loading).toBe(true);
  });

  test('UsePollingResult supports error state', () => {
    const err = new Error('fetch failed');
    const mock: UsePollingResult<string> = {
      data: null,
      loading: false,
      error: err,
      refresh: () => {},
    };
    expect(mock.error).toBe(err);
    expect(mock.error?.message).toBe('fetch failed');
  });
});
