import { describe, expect, test } from 'bun:test';
import {
  type AllMessagesData,
  type MessagesData,
  useAllMessages,
  useMessages,
} from './useMessages';

describe('useMessages', () => {
  test('module exports useMessages function', () => {
    expect(typeof useMessages).toBe('function');
  });

  test('module exports useAllMessages function', () => {
    expect(typeof useAllMessages).toBe('function');
  });

  test('MessagesData interface shape is correct', () => {
    const data: MessagesData = {
      messages: [],
      unreadCount: { count: 0, by_priority: {} },
    };
    expect(data.messages).toEqual([]);
    expect(data.unreadCount.count).toBe(0);
  });

  test('AllMessagesData interface shape is correct', () => {
    const data: AllMessagesData = {
      messages: [],
      totalUnread: 5,
    };
    expect(data.messages).toEqual([]);
    expect(data.totalUnread).toBe(5);
  });
});
