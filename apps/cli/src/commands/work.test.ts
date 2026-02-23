import { describe, expect, test } from 'bun:test';
import { expandIssueArgs } from './work';

describe('expandIssueArgs', () => {
  test('expands a numeric range', () => {
    expect(expandIssueArgs(['114-118'])).toEqual(['114', '115', '116', '117', '118']);
  });

  test('expands a #-prefixed range', () => {
    expect(expandIssueArgs(['#10-12'])).toEqual(['10', '11', '12']);
  });

  test('handles comma-separated tokens in a single arg', () => {
    expect(expandIssueArgs(['114,115,116'])).toEqual(['114', '115', '116']);
  });

  test('handles comma-separated tokens across multiple args', () => {
    expect(expandIssueArgs(['114,', '115,', '116'])).toEqual(['114', '115', '116']);
  });

  test('passes through bare numbers', () => {
    expect(expandIssueArgs(['42'])).toEqual(['42']);
  });

  test('passes through #-prefixed numbers', () => {
    expect(expandIssueArgs(['#42'])).toEqual(['#42']);
  });

  test('passes through GitHub URLs unchanged', () => {
    const url = 'https://github.com/owner/repo/issues/1';
    expect(expandIssueArgs([url])).toEqual([url]);
  });

  test('handles mixed input: range, comma-separated, bare', () => {
    expect(expandIssueArgs(['1-3,', '10,', '20'])).toEqual(['1', '2', '3', '10', '20']);
  });

  test('single issue range (start equals end)', () => {
    expect(expandIssueArgs(['5-5'])).toEqual(['5']);
  });

  test('caps range expansion at 100 issues', () => {
    // Range of >100 should throw
    expect(() => expandIssueArgs(['1-102'])).toThrow('cannot expand more than 100 issues');
    // Range of exactly 101 (1-101) should expand
    expect(expandIssueArgs(['1-101'])).toHaveLength(101);
  });

  test('reversed range throws an error', () => {
    expect(() => expandIssueArgs(['10-5'])).toThrow('start must be <= end');
  });

  test('empty input returns empty', () => {
    expect(expandIssueArgs([])).toEqual([]);
  });

  test('#N-#M format does not match (only #N-M supported)', () => {
    expect(expandIssueArgs(['#10-#12'])).toEqual(['#10-#12']);
  });
});
