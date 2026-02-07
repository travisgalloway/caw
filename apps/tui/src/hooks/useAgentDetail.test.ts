import { describe, expect, test } from 'bun:test';
import { type AgentDetailData, useAgentDetail } from './useAgentDetail';

describe('useAgentDetail', () => {
  test('module exports useAgentDetail function', () => {
    expect(typeof useAgentDetail).toBe('function');
  });

  test('AgentDetailData interface shape is correct', () => {
    const data: AgentDetailData = {
      agent: {
        id: 'ag_123',
        workflow_id: null,
        name: 'Claude',
        runtime: 'claude-code',
        role: 'worker',
        status: 'online',
        capabilities: '["code","review"]',
        current_task_id: null,
        workspace_path: null,
        last_heartbeat: Date.now(),
        metadata: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      messages: [],
      unreadCount: { count: 0, by_priority: {} },
      capabilities: ['code', 'review'],
    };
    expect(data.agent.id).toBe('ag_123');
    expect(data.capabilities).toEqual(['code', 'review']);
    expect(data.messages).toEqual([]);
    expect(data.unreadCount.count).toBe(0);
  });

  test('AgentDetailData supports empty capabilities', () => {
    const data: AgentDetailData = {
      agent: {
        id: 'ag_123',
        workflow_id: null,
        name: 'Claude',
        runtime: 'claude-code',
        role: 'worker',
        status: 'offline',
        capabilities: null,
        current_task_id: null,
        workspace_path: null,
        last_heartbeat: null,
        metadata: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      messages: [],
      unreadCount: { count: 0, by_priority: {} },
      capabilities: [],
    };
    expect(data.capabilities).toEqual([]);
    expect(data.agent.capabilities).toBeNull();
  });
});
