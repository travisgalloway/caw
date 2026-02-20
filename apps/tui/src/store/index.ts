import { create } from 'zustand';

export type WorkflowTab = 'tasks' | 'agents' | 'messages' | 'workspaces';

export type MainTab = 'workflows' | 'agents' | 'messages';

export type NavScreen =
  | { screen: 'workflow-list' }
  | { screen: 'workflow-detail'; workflowId: string; tab: WorkflowTab }
  | { screen: 'task-detail'; workflowId: string; taskId: string }
  | { screen: 'agent-detail'; workflowId: string | null; agentId: string }
  | { screen: 'message-detail'; workflowId: string | null; messageId: string }
  | { screen: 'help' }
  | { screen: 'setup' };

export type TaskViewMode = 'table' | 'tree' | 'dag';

export type MessageStatusFilter = 'all' | 'unread';

interface AppState {
  navStack: NavScreen[];

  mainTab: MainTab;
  showAll: boolean;
  taskViewMode: TaskViewMode;
  messageStatusFilter: MessageStatusFilter;
  pollInterval: number;
  lastRefreshAt: number;
  promptValue: string;
  promptFocused: boolean;
  promptError: string | null;
  promptSuccess: string | null;
  selectedWorkspaceId: string | null;

  push: (frame: NavScreen) => void;
  pop: () => void;
  replaceTop: (frame: NavScreen) => void;
  resetTo: (frame: NavScreen) => void;
  setWorkflowTab: (tab: WorkflowTab) => void;
  setMainTab: (tab: MainTab) => void;

  toggleShowAll: () => void;
  setTaskViewMode: (mode: TaskViewMode) => void;
  setMessageStatusFilter: (filter: MessageStatusFilter) => void;
  setPollInterval: (interval: number) => void;
  setPromptValue: (value: string) => void;
  setPromptFocused: (focused: boolean) => void;
  setPromptError: (error: string | null) => void;
  setPromptSuccess: (success: string | null) => void;
  setSelectedWorkspaceId: (id: string | null) => void;
  triggerRefresh: () => void;
  clearPromptFeedback: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  navStack: [{ screen: 'workflow-list' }],

  mainTab: 'workflows',
  showAll: false,
  taskViewMode: 'table',
  messageStatusFilter: 'all',
  pollInterval: 2000,
  lastRefreshAt: 0,
  promptValue: '',
  promptFocused: false,
  promptError: null,
  promptSuccess: null,
  selectedWorkspaceId: null,

  push: (frame) => set((s) => ({ navStack: [...s.navStack, frame] })),
  pop: () => set((s) => (s.navStack.length > 1 ? { navStack: s.navStack.slice(0, -1) } : s)),
  replaceTop: (frame) =>
    set((s) => ({
      navStack: s.navStack.length > 0 ? [...s.navStack.slice(0, -1), frame] : [frame],
    })),
  resetTo: (frame) => set({ navStack: [frame] }),
  setWorkflowTab: (tab) =>
    set((s) => {
      const top = s.navStack[s.navStack.length - 1];
      if (top?.screen === 'workflow-detail') {
        return {
          navStack: [...s.navStack.slice(0, -1), { ...top, tab }],
        };
      }
      return s;
    }),

  setMainTab: (tab) => set({ mainTab: tab }),

  toggleShowAll: () => set((s) => ({ showAll: !s.showAll })),
  setTaskViewMode: (mode) => set({ taskViewMode: mode }),
  setMessageStatusFilter: (filter) => set({ messageStatusFilter: filter }),
  setPollInterval: (interval) => set({ pollInterval: interval }),
  setPromptValue: (value) => set({ promptValue: value }),
  setPromptFocused: (focused) => set({ promptFocused: focused }),
  setPromptError: (error) => set({ promptError: error }),
  setPromptSuccess: (success) => set({ promptSuccess: success }),
  setSelectedWorkspaceId: (id) => set({ selectedWorkspaceId: id }),
  triggerRefresh: () => set({ lastRefreshAt: Date.now() }),
  clearPromptFeedback: () => set({ promptError: null, promptSuccess: null }),
}));

export function currentScreen(state: { navStack: NavScreen[] }): NavScreen {
  return state.navStack[state.navStack.length - 1] ?? { screen: 'workflow-list' };
}

export function getWorkflowId(state: { navStack: NavScreen[] }): string | null {
  for (let i = state.navStack.length - 1; i >= 0; i--) {
    const frame = state.navStack[i];
    if (frame && 'workflowId' in frame) {
      return frame.workflowId;
    }
  }
  return null;
}
