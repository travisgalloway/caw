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

  setView: (view: View) => void;
  setActivePanel: (panel: Panel) => void;
  selectWorkflow: (id: string | null) => void;
  selectAgent: (id: string | null) => void;
  selectTask: (id: string | null) => void;
  selectMessage: (id: string | null) => void;
  selectThread: (id: string | null) => void;
  setMessageStatusFilter: (filter: MessageStatusFilter) => void;
  setPollInterval: (interval: number) => void;
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

  setView: (view) => set({ view }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  selectWorkflow: (id) => set({ selectedWorkflowId: id }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  selectTask: (id) => set({ selectedTaskId: id }),
  selectMessage: (id) => set({ selectedMessageId: id }),
  selectThread: (id) => set({ selectedThreadId: id }),
  setMessageStatusFilter: (filter) => set({ messageStatusFilter: filter }),
  setPollInterval: (interval) => set({ pollInterval: interval }),
}));
