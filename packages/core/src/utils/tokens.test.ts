import { describe, expect, it } from 'bun:test';
import { estimateObjectTokens, estimateTokens } from './tokens';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 1 for a short string', () => {
    expect(estimateTokens('hi')).toBe(1);
  });

  it('returns ceil(length / 4)', () => {
    expect(estimateTokens('hello')).toBe(2); // 5/4 = 1.25 → 2
    expect(estimateTokens('abcd')).toBe(1); // 4/4 = 1
    expect(estimateTokens('abcde')).toBe(2); // 5/4 = 1.25 → 2
  });

  it('handles longer text', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });
});

describe('estimateObjectTokens', () => {
  it('matches estimateTokens of JSON.stringify', () => {
    const obj = { foo: 'bar', num: 42 };
    expect(estimateObjectTokens(obj)).toBe(estimateTokens(JSON.stringify(obj)));
  });

  it('handles empty object', () => {
    expect(estimateObjectTokens({})).toBe(estimateTokens('{}'));
  });

  it('handles nested objects', () => {
    const obj = { a: { b: { c: 'deep' } } };
    expect(estimateObjectTokens(obj)).toBe(estimateTokens(JSON.stringify(obj)));
  });

  it('handles arrays', () => {
    const obj = { items: [1, 2, 3] };
    expect(estimateObjectTokens(obj)).toBe(estimateTokens(JSON.stringify(obj)));
  });
});
