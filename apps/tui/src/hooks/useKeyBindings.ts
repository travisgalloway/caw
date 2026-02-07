import { useInput } from 'ink';
import { useAppStore } from '../store';

export function useKeyBindings(): void {
  useInput((_input, key) => {
    if (key.escape) {
      const { promptFocused, promptValue, navStack, pop } = useAppStore.getState();
      if (!promptFocused && !promptValue && navStack.length > 1) {
        pop();
      }
    }
  });
}
