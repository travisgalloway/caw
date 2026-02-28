<script lang="ts">
import * as Dialog from '$lib/components/ui/dialog/index.js';

interface Props {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

let { open = $bindable(false), onOpenChange }: Props = $props();

const shortcuts = [
  { keys: ['⌘', 'K'], description: 'Open command palette' },
  { keys: ['?'], description: 'Show keyboard shortcuts' },
  { keys: ['g', 'w'], description: 'Go to Workflows' },
  { keys: ['g', 'a'], description: 'Go to Agents' },
  { keys: ['g', 'm'], description: 'Go to Messages' },
  { keys: ['g', 't'], description: 'Go to Templates' },
  { keys: ['g', 's'], description: 'Go to Settings' },
];
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Keyboard Shortcuts</Dialog.Title>
      <Dialog.Description>Navigate faster with these shortcuts.</Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3">
      {#each shortcuts as shortcut}
        <div class="flex items-center justify-between">
          <span class="text-sm text-muted-foreground">{shortcut.description}</span>
          <div class="flex items-center gap-1">
            {#each shortcut.keys as key}
              <kbd
                class="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground"
              >
                {key}
              </kbd>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>
