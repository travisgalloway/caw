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
      pollInterval: 2000,
    });
  });

  test('has correct initial state', () => {
    const state = useAppStore.getState();
    expect(state.view).toBe('dashboard');
    expect(state.activePanel).toBe('workflows');
    expect(state.selectedWorkflowId).toBeNull();
    expect(state.selectedAgentId).toBeNull();
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
});
