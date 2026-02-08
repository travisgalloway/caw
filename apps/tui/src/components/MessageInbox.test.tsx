import { describe, expect, test } from 'bun:test';
import { MessageInbox } from './MessageInbox';

describe('MessageInbox', () => {
  test('exports MessageInbox as a function component', () => {
    expect(typeof MessageInbox).toBe('function');
  });

  test('has the expected function name', () => {
    expect(MessageInbox.name).toBe('MessageInbox');
  });
});
