import { describe, expect, it } from 'vitest';
import type { Checkpoint } from '../types/checkpoint';
import {
  compressCheckpoints,
  compressFileList,
  compressText,
  truncateToTokenBudget,
} from './compress';

describe('truncateToTokenBudget', () => {
  it('returns text unchanged when within budget', () => {
    const text = 'hello'; // 2 tokens
    expect(truncateToTokenBudget(text, 10)).toBe(text);
  });

  it('truncates text that exceeds budget', () => {
    const text = 'a'.repeat(100); // 25 tokens
    const result = truncateToTokenBudget(text, 5);
    expect(result).toContain('... [truncated]');
    expect(result.startsWith('a'.repeat(20))).toBe(true);
  });

  it('handles exact boundary', () => {
    const text = 'abcd'; // exactly 1 token
    expect(truncateToTokenBudget(text, 1)).toBe(text);
  });

  it('handles empty string', () => {
    expect(truncateToTokenBudget('', 10)).toBe('');
  });
});

describe('compressFileList', () => {
  it('returns null for null input', () => {
    expect(compressFileList(null)).toBeNull();
  });

  it('returns unchanged when under limit', () => {
    const files = JSON.stringify(['a.ts', 'b.ts']);
    expect(compressFileList(files)).toBe(files);
  });

  it('returns unchanged when at exact limit', () => {
    const files = Array.from({ length: 10 }, (_, i) => `file${i}.ts`);
    const json = JSON.stringify(files);
    expect(compressFileList(json, 10)).toBe(json);
  });

  it('truncates and appends count when over limit', () => {
    const files = Array.from({ length: 15 }, (_, i) => `file${i}.ts`);
    const result = compressFileList(JSON.stringify(files), 10);
    const parsed = JSON.parse(result as string);
    expect(parsed).toHaveLength(11); // 10 files + "and 5 more"
    expect(parsed[10]).toBe('and 5 more');
  });

  it('respects custom maxFiles', () => {
    const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'];
    const result = compressFileList(JSON.stringify(files), 3);
    const parsed = JSON.parse(result as string);
    expect(parsed).toHaveLength(4); // 3 + "and 2 more"
    expect(parsed[3]).toBe('and 2 more');
  });
});

describe('compressCheckpoints', () => {
  function makeCheckpoint(
    seq: number,
    detail: string | null,
    filesChanged: string | null,
  ): Checkpoint {
    return {
      id: `cp_test${seq}`,
      task_id: 'tk_test',
      sequence: seq,
      checkpoint_type: 'progress',
      summary: `Step ${seq}`,
      detail,
      files_changed: filesChanged,
      created_at: Date.now(),
    };
  }

  it('returns unchanged when under recentCount', () => {
    const cps = [
      makeCheckpoint(1, '{"a":1}', '["f.ts"]'),
      makeCheckpoint(2, '{"b":2}', '["g.ts"]'),
    ];
    const result = compressCheckpoints(cps, 5);
    expect(result).toEqual(cps);
  });

  it('returns unchanged when at exact recentCount', () => {
    const cps = [makeCheckpoint(1, '{"a":1}', null), makeCheckpoint(2, '{"b":2}', null)];
    const result = compressCheckpoints(cps, 2);
    expect(result).toEqual(cps);
  });

  it('strips detail and files_changed from older checkpoints', () => {
    const cps = [
      makeCheckpoint(1, '{"old":true}', '["old.ts"]'),
      makeCheckpoint(2, '{"old2":true}', '["old2.ts"]'),
      makeCheckpoint(3, '{"recent":true}', '["recent.ts"]'),
    ];
    const result = compressCheckpoints(cps, 1);

    expect(result).toHaveLength(3);
    // Older checkpoints stripped
    expect(result[0].detail).toBeNull();
    expect(result[0].files_changed).toBeNull();
    expect(result[0].summary).toBe('Step 1');
    expect(result[1].detail).toBeNull();
    expect(result[1].files_changed).toBeNull();
    // Recent checkpoint preserved
    expect(result[2].detail).toBe('{"recent":true}');
    expect(result[2].files_changed).toBe('["recent.ts"]');
  });
});

describe('compressText', () => {
  it('returns null for null input', () => {
    expect(compressText(null, 100)).toBeNull();
  });

  it('returns text unchanged when within budget', () => {
    expect(compressText('hello', 100)).toBe('hello');
  });

  it('truncates text that exceeds budget', () => {
    const text = 'a'.repeat(100);
    const result = compressText(text, 5);
    expect(result).toContain('... [truncated]');
  });
});
