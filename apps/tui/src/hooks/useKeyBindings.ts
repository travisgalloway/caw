import { useApp, useInput } from 'ink';
import type { Panel } from '../store';
import { useAppStore } from '../store';

const panelKeys: Record<string, Panel> = {
  w: 'workflows',
  a: 'agents',
  t: 'tasks',
  m: 'messages',
};

export function useKeyBindings(onRefresh?: () => void): void {
  const { exit } = useApp();
  const { view, setView, setActivePanel } = useAppStore();

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }

    if (input === '?') {
      setView(view === 'help' ? 'dashboard' : 'help');
      return;
    }

    if (key.escape) {
      setView('dashboard');
      return;
    }

    if (view === 'dashboard' && panelKeys[input]) {
      setActivePanel(panelKeys[input]);
      return;
    }

    if (input === 'r' && onRefresh) {
      onRefresh();
    }
  });
}
