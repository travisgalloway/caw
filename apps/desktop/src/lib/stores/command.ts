import { writable } from 'svelte/store';

export interface CommandAction {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  onSelect: () => void;
}

interface CommandStore {
  open: boolean;
  actions: CommandAction[];
}

function createCommandStore() {
  const { subscribe, set, update } = writable<CommandStore>({
    open: false,
    actions: [],
  });

  return {
    subscribe,
    toggle() {
      update((s) => ({ ...s, open: !s.open }));
    },
    setOpen(open: boolean) {
      update((s) => ({ ...s, open }));
    },
    registerActions(actions: CommandAction[]) {
      update((s) => ({
        ...s,
        actions: [...s.actions.filter((a) => !actions.some((b) => b.id === a.id)), ...actions],
      }));
    },
    unregisterActions(ids: string[]) {
      update((s) => ({
        ...s,
        actions: s.actions.filter((a) => !ids.includes(a.id)),
      }));
    },
  };
}

export const commandStore = createCommandStore();
