import { afterEach, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';

describe('useAppStore', () => {
  afterEach(() => {
    // Reset store to initial state between tests
    useAppStore.setState({
      view: 'dashboard',
      activePanel: 'workflows',
      selectedWorkflowId: null,
      selectedAgentId: null,
      selectedTaskId: null,
      selectedMessageId: null,
      selectedThreadId: null,
      messageStatusFilter: 'all',
      pollInterval: 2000,
    });
  });

  test('has correct initial state', () => {
    const state = useAppStore.getState();
    expect(state.view).toBe('dashboard');
    expect(state.activePanel).toBe('workflows');
    expect(state.selectedWorkflowId).toBeNull();
    expect(state.selectedAgentId).toBeNull();
    expect(state.selectedTaskId).toBeNull();
    expect(state.selectedMessageId).toBeNull();
    expect(state.selectedThreadId).toBeNull();
    expect(state.messageStatusFilter).toBe('all');
    expect(state.pollInterval).toBe(2000);
  });

  test('setView updates view', () => {
    useAppStore.getState().setView('help');
    expect(useAppStore.getState().view).toBe('help');

    useAppStore.getState().setView('workflow-detail');
    expect(useAppStore.getState().view).toBe('workflow-detail');
  });

  test('setActivePanel updates panel', () => {
    useAppStore.getState().setActivePanel('agents');
    expect(useAppStore.getState().activePanel).toBe('agents');

    useAppStore.getState().setActivePanel('tasks');
    expect(useAppStore.getState().activePanel).toBe('tasks');

    useAppStore.getState().setActivePanel('messages');
    expect(useAppStore.getState().activePanel).toBe('messages');
  });

  test('selectWorkflow updates selectedWorkflowId', () => {
    useAppStore.getState().selectWorkflow('wf_abc123');
    expect(useAppStore.getState().selectedWorkflowId).toBe('wf_abc123');

    useAppStore.getState().selectWorkflow(null);
    expect(useAppStore.getState().selectedWorkflowId).toBeNull();
  });

  test('selectAgent updates selectedAgentId', () => {
    useAppStore.getState().selectAgent('ag_xyz789');
    expect(useAppStore.getState().selectedAgentId).toBe('ag_xyz789');

    useAppStore.getState().selectAgent(null);
    expect(useAppStore.getState().selectedAgentId).toBeNull();
  });

  test('setPollInterval updates interval', () => {
    useAppStore.getState().setPollInterval(5000);
    expect(useAppStore.getState().pollInterval).toBe(5000);
  });

  test('selectTask updates selectedTaskId', () => {
    useAppStore.getState().selectTask('tk_abc123');
    expect(useAppStore.getState().selectedTaskId).toBe('tk_abc123');

    useAppStore.getState().selectTask(null);
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  test('selectMessage updates selectedMessageId', () => {
    useAppStore.getState().selectMessage('msg_abc123');
    expect(useAppStore.getState().selectedMessageId).toBe('msg_abc123');

    useAppStore.getState().selectMessage(null);
    expect(useAppStore.getState().selectedMessageId).toBeNull();
  });

  test('selectThread updates selectedThreadId', () => {
    useAppStore.getState().selectThread('msg_thread1');
    expect(useAppStore.getState().selectedThreadId).toBe('msg_thread1');

    useAppStore.getState().selectThread(null);
    expect(useAppStore.getState().selectedThreadId).toBeNull();
  });

  test('setMessageStatusFilter updates filter', () => {
    useAppStore.getState().setMessageStatusFilter('unread');
    expect(useAppStore.getState().messageStatusFilter).toBe('unread');

    useAppStore.getState().setMessageStatusFilter('all');
    expect(useAppStore.getState().messageStatusFilter).toBe('all');
  });

  test('multiple state changes are independent', () => {
    useAppStore.getState().setView('help');
    useAppStore.getState().setActivePanel('agents');
    useAppStore.getState().selectWorkflow('wf_test');

    const state = useAppStore.getState();
    expect(state.view).toBe('help');
    expect(state.activePanel).toBe('agents');
    expect(state.selectedWorkflowId).toBe('wf_test');
    expect(state.selectedAgentId).toBeNull();
    expect(state.pollInterval).toBe(2000);
  });

  test('workflow detail navigation flow', () => {
    // Simulate: dashboard → select workflow → select task → back
    useAppStore.getState().setView('workflow-detail');
    useAppStore.getState().selectWorkflow('wf_123');
    useAppStore.getState().selectTask('tk_456');

    let state = useAppStore.getState();
    expect(state.view).toBe('workflow-detail');
    expect(state.selectedWorkflowId).toBe('wf_123');
    expect(state.selectedTaskId).toBe('tk_456');

    // Navigate back
    useAppStore.getState().selectTask(null);
    useAppStore.getState().selectWorkflow(null);
    useAppStore.getState().setView('dashboard');

    state = useAppStore.getState();
    expect(state.view).toBe('dashboard');
    expect(state.selectedWorkflowId).toBeNull();
    expect(state.selectedTaskId).toBeNull();
  });

  test('agent detail with message filter flow', () => {
    useAppStore.getState().setView('agent-detail');
    useAppStore.getState().selectAgent('ag_123');
    useAppStore.getState().setMessageStatusFilter('unread');
    useAppStore.getState().selectMessage('msg_456');

    const state = useAppStore.getState();
    expect(state.view).toBe('agent-detail');
    expect(state.selectedAgentId).toBe('ag_123');
    expect(state.messageStatusFilter).toBe('unread');
    expect(state.selectedMessageId).toBe('msg_456');
  });
});
