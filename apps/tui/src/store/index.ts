import { create } from 'zustand';

export type Panel = 'workflows' | 'agents' | 'tasks' | 'messages';
export type View = 'dashboard' | 'workflow-detail' | 'agent-detail' | 'help';

export type MessageStatusFilter = 'all' | 'unread';

interface AppState {
  view: View;
  activePanel: Panel;
  selectedWorkflowId: string | null;
  selectedAgentId: string | null;
  selectedTaskId: string | null;
  selectedMessageId: string | null;
  selectedThreadId: string | null;
  messageStatusFilter: MessageStatusFilter;
  pollInterval: number;
  promptValue: string;
  promptFocused: boolean;
  promptError: string | null;
  promptSuccess: string | null;
  lastRefreshAt: number;

  setView: (view: View) => void;
  setActivePanel: (panel: Panel) => void;
  selectWorkflow: (id: string | null) => void;
  selectAgent: (id: string | null) => void;
  selectTask: (id: string | null) => void;
  selectMessage: (id: string | null) => void;
  selectThread: (id: string | null) => void;
  setMessageStatusFilter: (filter: MessageStatusFilter) => void;
  setPollInterval: (interval: number) => void;
  setPromptValue: (value: string) => void;
  setPromptFocused: (focused: boolean) => void;
  setPromptError: (error: string | null) => void;
  setPromptSuccess: (success: string | null) => void;
  triggerRefresh: () => void;
  clearPromptFeedback: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: 'dashboard',
  activePanel: 'workflows',
  selectedWorkflowId: null,
  selectedAgentId: null,
  selectedTaskId: null,
  selectedMessageId: null,
  selectedThreadId: null,
  messageStatusFilter: 'all',
  pollInterval: 2000,
  promptValue: '',
  promptFocused: false,
  promptError: null,
  promptSuccess: null,
  lastRefreshAt: 0,

  setView: (view) => set({ view }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  selectWorkflow: (id) => set({ selectedWorkflowId: id }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  selectTask: (id) => set({ selectedTaskId: id }),
  selectMessage: (id) => set({ selectedMessageId: id }),
  selectThread: (id) => set({ selectedThreadId: id }),
  setMessageStatusFilter: (filter) => set({ messageStatusFilter: filter }),
  setPollInterval: (interval) => set({ pollInterval: interval }),
  setPromptValue: (value) => set({ promptValue: value }),
  setPromptFocused: (focused) => set({ promptFocused: focused }),
  setPromptError: (error) => set({ promptError: error }),
  setPromptSuccess: (success) => set({ promptSuccess: success }),
  triggerRefresh: () => set({ lastRefreshAt: Date.now() }),
  clearPromptFeedback: () => set({ promptError: null, promptSuccess: null }),
}));
