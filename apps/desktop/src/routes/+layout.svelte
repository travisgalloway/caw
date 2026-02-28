<script lang="ts">
import { ModeWatcher } from 'mode-watcher';
import { onDestroy, onMount } from 'svelte';
import { goto } from '$app/navigation';
import CommandPalette from '$lib/components/CommandPalette.svelte';
import KeyboardShortcutsDialog from '$lib/components/KeyboardShortcutsDialog.svelte';
import { Toaster } from '$lib/components/ui/sonner/index.js';
import { commandStore } from '$lib/stores/command';
import { handleWsToast } from '$lib/stores/toast';
import { wsStore } from '$lib/stores/ws';
import '../app.css';

const { children } = $props();

let shortcutsOpen = $state(false);
let pendingGo = $state('');
let goTimer: ReturnType<typeof setTimeout> | null = null;

onMount(() => {
  wsStore.connect();
  wsStore.subscribeChannel('global');
});

onDestroy(() => {
  wsStore.unsubscribeChannel('global');
  wsStore.disconnect();
  if (goTimer) clearTimeout(goTimer);
});

// Toast on WS events
let lastEventRef: unknown = null;
$effect(() => {
  const event = $wsStore.lastEvent;
  if (event && event !== lastEventRef) {
    lastEventRef = event;
    handleWsToast(event);
  }
});

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return;
  }

  // Cmd+K / Ctrl+K for command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    commandStore.toggle();
    return;
  }

  // Cmd+, for settings
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault();
    import('$lib/utils/settings-window').then((m) => m.openSettingsWindow());
    return;
  }

  // ? for shortcuts help
  if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    shortcutsOpen = true;
    return;
  }

  // g + <key> for navigation
  if (pendingGo) {
    e.preventDefault();
    const goMap: Record<string, string> = {
      w: '/',
      a: '/agents',
      m: '/messages',
    };
    const dest = goMap[e.key];
    if (dest) goto(dest);
    pendingGo = '';
    if (goTimer) clearTimeout(goTimer);
    return;
  }
  if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
    pendingGo = 'g';
    goTimer = setTimeout(() => {
      pendingGo = '';
    }, 1000);
  }
}
</script>

<ModeWatcher />
<svelte:window onkeydown={handleKeydown} />

{@render children()}

<Toaster richColors closeButton />
<CommandPalette />
<KeyboardShortcutsDialog bind:open={shortcutsOpen} />
