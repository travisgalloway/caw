import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { formatRelativeTime, formatTimestamp } from './format';

describe('formatRelativeTime', () => {
  let realDateNow: () => number;
  const FIXED_NOW = 1700000000000; // Fixed reference time

  beforeEach(() => {
    realDateNow = Date.now;
    Date.now = () => FIXED_NOW;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it('returns "never" for null', () => {
    expect(formatRelativeTime(null)).toBe('never');
  });

  it('returns "never" for 0', () => {
    expect(formatRelativeTime(0)).toBe('never');
  });

  it('returns seconds for < 60s ago', () => {
    expect(formatRelativeTime(FIXED_NOW - 5000)).toBe('5s ago');
    expect(formatRelativeTime(FIXED_NOW - 30000)).toBe('30s ago');
    expect(formatRelativeTime(FIXED_NOW - 59000)).toBe('59s ago');
  });

  it('returns 0s for just now', () => {
    expect(formatRelativeTime(FIXED_NOW)).toBe('0s ago');
  });

  it('returns minutes for 1-59 minutes ago', () => {
    expect(formatRelativeTime(FIXED_NOW - 60000)).toBe('1m ago');
    expect(formatRelativeTime(FIXED_NOW - 300000)).toBe('5m ago');
    expect(formatRelativeTime(FIXED_NOW - 3540000)).toBe('59m ago');
  });

  it('returns hours for 1-23 hours ago', () => {
    expect(formatRelativeTime(FIXED_NOW - 3600000)).toBe('1h ago');
    expect(formatRelativeTime(FIXED_NOW - 7200000)).toBe('2h ago');
    expect(formatRelativeTime(FIXED_NOW - 82800000)).toBe('23h ago');
  });

  it('returns days for 1+ days ago', () => {
    expect(formatRelativeTime(FIXED_NOW - 86400000)).toBe('1d ago');
    expect(formatRelativeTime(FIXED_NOW - 172800000)).toBe('2d ago');
    expect(formatRelativeTime(FIXED_NOW - 604800000)).toBe('7d ago');
  });
});

describe('formatTimestamp', () => {
  it('formats a timestamp as locale string', () => {
    const result = formatTimestamp(1700000000000);
    // Just verify it returns a non-empty string (locale format varies by environment)
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats different timestamps to different strings', () => {
    const a = formatTimestamp(1700000000000);
    const b = formatTimestamp(1700000060000);
    expect(a).not.toBe(b);
  });
});
