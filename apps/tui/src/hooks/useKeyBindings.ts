import { useInput } from 'ink';
import { useAppStore } from '../store';

export function useKeyBindings(): void {
  useInput((_input, key) => {
    if (key.escape) {
      const { promptFocused, promptValue } = useAppStore.getState();
      if (!promptFocused && !promptValue) {
        useAppStore.getState().setView('dashboard');
      }
    }
  });
}
