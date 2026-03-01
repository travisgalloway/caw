<script lang="ts">
import { goto } from '$app/navigation';
import * as Command from '$lib/components/ui/command/index.js';
import { type CommandAction, commandStore } from '$lib/stores/command';

let search = $state('');

const navActions: CommandAction[] = [
  { id: 'nav-workflows', label: 'Go to Workflows', group: 'Navigation', onSelect: () => goto('/') },
  { id: 'nav-agents', label: 'Go to Agents', group: 'Navigation', onSelect: () => goto('/agents') },
  {
    id: 'nav-messages',
    label: 'Go to Messages',
    group: 'Navigation',
    onSelect: () => goto('/messages'),
  },
  {
    id: 'nav-templates',
    label: 'Go to Templates',
    group: 'Navigation',
    onSelect: () => goto('/templates'),
  },
  {
    id: 'nav-settings',
    label: 'Open Settings',
    group: 'Navigation',
    onSelect: () => goto('/settings'),
  },
];

const allActions: CommandAction[] = $derived([...navActions, ...$commandStore.actions]);

const groups = $derived(
  allActions.reduce<Record<string, typeof allActions>>((acc, action) => {
    const group = action.group;
    if (!acc[group]) acc[group] = [];
    acc[group].push(action);
    return acc;
  }, {}),
);

function handleSelect(action: (typeof allActions)[0]) {
  commandStore.setOpen(false);
  search = '';
  action.onSelect();
}
</script>

<Command.Dialog bind:open={$commandStore.open}>
  <Command.Input placeholder="Type a command or search..." bind:value={search} />
  <Command.List>
    <Command.Empty>No results found.</Command.Empty>
    {#each Object.entries(groups) as [group, actions]}
      <Command.Group heading={group}>
        {#each actions as action}
          <Command.Item value={action.label} onSelect={() => handleSelect(action)}>
            {action.label}
            {#if action.shortcut}
              <Command.Shortcut>{action.shortcut}</Command.Shortcut>
            {/if}
          </Command.Item>
        {/each}
      </Command.Group>
    {/each}
  </Command.List>
</Command.Dialog>
