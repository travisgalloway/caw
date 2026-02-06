import { describe, expect, it } from 'bun:test';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { handleToolCall, handleToolCallAsync, ToolCallError } from './types';

function parseContent(result: CallToolResult): unknown {
  const item = result.content[0];
  if (item.type !== 'text') throw new Error('Expected text content');
  return JSON.parse(item.text);
}

describe('handleToolCall', () => {
  it('returns result on success', () => {
    const result = handleToolCall(() => ({ foo: 'bar' }));
    expect(result.isError).toBeUndefined();
    expect(parseContent(result)).toEqual({ foo: 'bar' });
  });

  it('returns structured error for ToolCallError', () => {
    const result = handleToolCall(() => {
      throw new ToolCallError({
        code: 'TEST_ERROR',
        message: 'test message',
        recoverable: true,
        suggestion: 'try again',
      });
    });
    expect(result.isError).toBe(true);
    const parsed = parseContent(result) as Record<string, unknown>;
    expect(parsed.code).toBe('TEST_ERROR');
    expect(parsed.message).toBe('test message');
    expect(parsed.recoverable).toBe(true);
    expect(parsed.suggestion).toBe('try again');
  });

  it('returns structured INTERNAL_ERROR for unknown Error', () => {
    const result = handleToolCall(() => {
      throw new Error('something broke');
    });
    expect(result.isError).toBe(true);
    const parsed = parseContent(result) as Record<string, unknown>;
    expect(parsed.code).toBe('INTERNAL_ERROR');
    expect(parsed.message).toBe('something broke');
    expect(parsed.recoverable).toBe(false);
    expect(parsed.suggestion).toContain('unexpected error');
  });

  it('returns structured INTERNAL_ERROR for non-Error throws', () => {
    const result = handleToolCall(() => {
      throw 'string error';
    });
    expect(result.isError).toBe(true);
    const parsed = parseContent(result) as Record<string, unknown>;
    expect(parsed.code).toBe('INTERNAL_ERROR');
    expect(parsed.message).toBe('string error');
    expect(parsed.recoverable).toBe(false);
  });
});

describe('handleToolCallAsync', () => {
  it('returns result on success', async () => {
    const result = await handleToolCallAsync(async () => ({ foo: 'bar' }));
    expect(result.isError).toBeUndefined();
    expect(parseContent(result)).toEqual({ foo: 'bar' });
  });

  it('returns structured error for ToolCallError', async () => {
    const result = await handleToolCallAsync(async () => {
      throw new ToolCallError({
        code: 'ASYNC_ERROR',
        message: 'async test',
        recoverable: false,
        suggestion: 'check logs',
      });
    });
    expect(result.isError).toBe(true);
    const parsed = parseContent(result) as Record<string, unknown>;
    expect(parsed.code).toBe('ASYNC_ERROR');
    expect(parsed.message).toBe('async test');
  });

  it('returns structured INTERNAL_ERROR for unknown Error', async () => {
    const result = await handleToolCallAsync(async () => {
      throw new Error('async broke');
    });
    expect(result.isError).toBe(true);
    const parsed = parseContent(result) as Record<string, unknown>;
    expect(parsed.code).toBe('INTERNAL_ERROR');
    expect(parsed.message).toBe('async broke');
    expect(parsed.recoverable).toBe(false);
  });

  it('returns structured INTERNAL_ERROR for non-Error throws', async () => {
    const result = await handleToolCallAsync(async () => {
      throw 42;
    });
    expect(result.isError).toBe(true);
    const parsed = parseContent(result) as Record<string, unknown>;
    expect(parsed.code).toBe('INTERNAL_ERROR');
    expect(parsed.message).toBe('42');
  });
});
