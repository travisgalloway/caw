import { create } from 'zustand';

export type Panel = 'workflows' | 'agents' | 'tasks' | 'messages';
export type View = 'dashboard' | 'workflow-detail' | 'agent-detail' | 'help';

interface AppState {
  view: View;
  activePanel: Panel;
  selectedWorkflowId: string | null;
  selectedAgentId: string | null;
  selectedTaskId: string | null;
  pollInterval: number;

  setView: (view: View) => void;
  setActivePanel: (panel: Panel) => void;
  selectWorkflow: (id: string | null) => void;
  selectAgent: (id: string | null) => void;
  selectTask: (id: string | null) => void;
  setPollInterval: (interval: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: 'dashboard',
  activePanel: 'workflows',
  selectedWorkflowId: null,
  selectedAgentId: null,
  selectedTaskId: null,
  pollInterval: 2000,

  setView: (view) => set({ view }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  selectWorkflow: (id) => set({ selectedWorkflowId: id }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  selectTask: (id) => set({ selectedTaskId: id }),
  setPollInterval: (interval) => set({ pollInterval: interval }),
}));
