import { afterEach, describe, expect, test } from 'bun:test';
import { currentScreen, getWorkflowId, useAppStore } from './index';

const INITIAL_STATE = {
  navStack: [{ screen: 'workflow-list' as const }],
  showAllWorkflows: false,
  taskViewMode: 'table' as const,
  messageStatusFilter: 'all' as const,
  pollInterval: 2000,
  lastRefreshAt: 0,
  promptValue: '',
  promptFocused: false,
  promptError: null,
  promptSuccess: null,
};

describe('useAppStore', () => {
  afterEach(() => {
    useAppStore.setState(INITIAL_STATE);
  });

  test('has correct initial state', () => {
    const state = useAppStore.getState();
    expect(state.navStack).toEqual([{ screen: 'workflow-list' }]);
    expect(state.showAllWorkflows).toBe(false);
    expect(state.taskViewMode).toBe('table');
    expect(state.messageStatusFilter).toBe('all');
    expect(state.pollInterval).toBe(2000);
    expect(state.promptValue).toBe('');
    expect(state.promptFocused).toBe(false);
    expect(state.promptError).toBeNull();
    expect(state.promptSuccess).toBeNull();
    expect(state.lastRefreshAt).toBe(0);
  });

  test('push appends frame to navStack', () => {
    useAppStore.getState().push({ screen: 'workflow-detail', workflowId: 'wf_123', tab: 'tasks' });
    expect(useAppStore.getState().navStack).toEqual([
      { screen: 'workflow-list' },
      { screen: 'workflow-detail', workflowId: 'wf_123', tab: 'tasks' },
    ]);
  });

  test('pop removes top frame', () => {
    useAppStore.getState().push({ screen: 'workflow-detail', workflowId: 'wf_123', tab: 'tasks' });
    useAppStore.getState().pop();
    expect(useAppStore.getState().navStack).toEqual([{ screen: 'workflow-list' }]);
  });

  test('pop on root is no-op', () => {
    useAppStore.getState().pop();
    expect(useAppStore.getState().navStack).toEqual([{ screen: 'workflow-list' }]);
  });

  test('replaceTop swaps top frame', () => {
    useAppStore.getState().push({ screen: 'workflow-detail', workflowId: 'wf_123', tab: 'tasks' });
    useAppStore
      .getState()
      .replaceTop({ screen: 'workflow-detail', workflowId: 'wf_456', tab: 'agents' });
    expect(useAppStore.getState().navStack).toEqual([
      { screen: 'workflow-list' },
      { screen: 'workflow-detail', workflowId: 'wf_456', tab: 'agents' },
    ]);
  });

  test('resetTo replaces entire stack', () => {
    useAppStore.getState().push({ screen: 'workflow-detail', workflowId: 'wf_123', tab: 'tasks' });
    useAppStore.getState().push({ screen: 'task-detail', workflowId: 'wf_123', taskId: 'tk_456' });
    useAppStore.getState().resetTo({ screen: 'workflow-list' });
    expect(useAppStore.getState().navStack).toEqual([{ screen: 'workflow-list' }]);
  });

  test('setWorkflowTab updates tab on workflow-detail frame', () => {
    useAppStore.getState().push({ screen: 'workflow-detail', workflowId: 'wf_123', tab: 'tasks' });
    useAppStore.getState().setWorkflowTab('agents');
    const top = useAppStore.getState().navStack[1];
    expect(top).toEqual({ screen: 'workflow-detail', workflowId: 'wf_123', tab: 'agents' });
  });

  test('setWorkflowTab is no-op on non-workflow-detail screen', () => {
    const before = useAppStore.getState().navStack;
    useAppStore.getState().setWorkflowTab('agents');
    expect(useAppStore.getState().navStack).toEqual(before);
  });

  test('navigation flow: push workflow-detail → push task-detail → pop → pop → back at workflow-list', () => {
    useAppStore.getState().push({ screen: 'workflow-detail', workflowId: 'wf_123', tab: 'tasks' });
    useAppStore.getState().push({ screen: 'task-detail', workflowId: 'wf_123', taskId: 'tk_456' });
    expect(useAppStore.getState().navStack).toHaveLength(3);

    useAppStore.getState().pop();
    expect(currentScreen(useAppStore.getState()).screen).toBe('workflow-detail');

    useAppStore.getState().pop();
    expect(currentScreen(useAppStore.getState()).screen).toBe('workflow-list');
  });

  test('setPollInterval updates interval', () => {
    useAppStore.getState().setPollInterval(5000);
    expect(useAppStore.getState().pollInterval).toBe(5000);
  });

  test('setPromptValue updates promptValue', () => {
    useAppStore.getState().setPromptValue('/help');
    expect(useAppStore.getState().promptValue).toBe('/help');
  });

  test('setPromptFocused updates promptFocused', () => {
    useAppStore.getState().setPromptFocused(true);
    expect(useAppStore.getState().promptFocused).toBe(true);
  });

  test('setPromptError updates promptError', () => {
    useAppStore.getState().setPromptError('Something went wrong');
    expect(useAppStore.getState().promptError).toBe('Something went wrong');
  });

  test('setPromptSuccess updates promptSuccess', () => {
    useAppStore.getState().setPromptSuccess('Data refreshed');
    expect(useAppStore.getState().promptSuccess).toBe('Data refreshed');
  });

  test('triggerRefresh updates lastRefreshAt', () => {
    const before = Date.now();
    useAppStore.getState().triggerRefresh();
    const after = Date.now();

    const value = useAppStore.getState().lastRefreshAt;
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  test('clearPromptFeedback clears both error and success', () => {
    useAppStore.getState().setPromptError('error');
    useAppStore.getState().setPromptSuccess('success');
    useAppStore.getState().clearPromptFeedback();

    const state = useAppStore.getState();
    expect(state.promptError).toBeNull();
    expect(state.promptSuccess).toBeNull();
  });

  test('toggleShowAllWorkflows toggles the flag', () => {
    expect(useAppStore.getState().showAllWorkflows).toBe(false);
    useAppStore.getState().toggleShowAllWorkflows();
    expect(useAppStore.getState().showAllWorkflows).toBe(true);
    useAppStore.getState().toggleShowAllWorkflows();
    expect(useAppStore.getState().showAllWorkflows).toBe(false);
  });

  test('setTaskViewMode updates taskViewMode', () => {
    expect(useAppStore.getState().taskViewMode).toBe('table');
    useAppStore.getState().setTaskViewMode('dag');
    expect(useAppStore.getState().taskViewMode).toBe('dag');
    useAppStore.getState().setTaskViewMode('tree');
    expect(useAppStore.getState().taskViewMode).toBe('tree');
  });

  test('setMessageStatusFilter updates filter', () => {
    useAppStore.getState().setMessageStatusFilter('unread');
    expect(useAppStore.getState().messageStatusFilter).toBe('unread');
    useAppStore.getState().setMessageStatusFilter('all');
    expect(useAppStore.getState().messageStatusFilter).toBe('all');
  });
});

describe('currentScreen', () => {
  afterEach(() => {
    useAppStore.setState(INITIAL_STATE);
  });

  test('returns top frame', () => {
    expect(currentScreen(useAppStore.getState()).screen).toBe('workflow-list');
  });

  test('returns top frame after push', () => {
    useAppStore.getState().push({ screen: 'help' });
    expect(currentScreen(useAppStore.getState()).screen).toBe('help');
  });

  test('returns setup screen after push', () => {
    useAppStore.getState().push({ screen: 'setup' });
    expect(currentScreen(useAppStore.getState()).screen).toBe('setup');
  });
});

describe('getWorkflowId', () => {
  afterEach(() => {
    useAppStore.setState(INITIAL_STATE);
  });

  test('returns null when no workflow in stack', () => {
    expect(getWorkflowId(useAppStore.getState())).toBeNull();
  });

  test('returns workflowId from workflow-detail frame', () => {
    useAppStore.getState().push({ screen: 'workflow-detail', workflowId: 'wf_123', tab: 'tasks' });
    expect(getWorkflowId(useAppStore.getState())).toBe('wf_123');
  });

  test('returns workflowId from deepest frame with workflowId', () => {
    useAppStore.getState().push({ screen: 'workflow-detail', workflowId: 'wf_123', tab: 'tasks' });
    useAppStore.getState().push({ screen: 'task-detail', workflowId: 'wf_123', taskId: 'tk_456' });
    expect(getWorkflowId(useAppStore.getState())).toBe('wf_123');
  });
});
