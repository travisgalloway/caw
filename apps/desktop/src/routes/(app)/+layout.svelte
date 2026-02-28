<script lang="ts">
import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
import SettingsIcon from '@lucide/svelte/icons/settings';
import SquareIcon from '@lucide/svelte/icons/square';
import WifiIcon from '@lucide/svelte/icons/wifi';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import LiveIndicator from '$lib/components/LiveIndicator.svelte';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
import * as Tabs from '$lib/components/ui/tabs/index.js';
import { wsStore } from '$lib/stores/ws';
import { openSettingsWindow } from '$lib/utils/settings-window';

const { children } = $props();

let isTauri = $state(false);
let serverAction = $state<'restarting' | 'stopping' | null>(null);

$effect(() => {
  if (typeof window !== 'undefined') {
    isTauri = '__TAURI_INTERNALS__' in window;
  }
});

async function startDragging(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button, a, input, [data-slot]')) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  } catch {
    // Not running in Tauri (e.g. browser dev mode)
  }
}

const tabItems = [
  { value: '/', label: 'Workflows' },
  { value: '/agents', label: 'Agents' },
  { value: '/messages', label: 'Messages' },
];

function getActiveTab(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/workflows')) return '/';
  if (pathname === '/agents' || pathname.startsWith('/agents/')) return '/agents';
  if (pathname === '/messages' || pathname.startsWith('/messages/')) return '/messages';
  return '/';
}

async function restartServer() {
  if (serverAction) return;
  serverAction = 'restarting';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('restart_server');
  } catch (e) {
    console.error('Failed to restart server:', e);
  } finally {
    serverAction = null;
  }
}

async function stopServer() {
  if (serverAction) return;
  serverAction = 'stopping';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('stop_server');
  } catch (e) {
    console.error('Failed to stop server:', e);
  } finally {
    serverAction = null;
  }
}

function reconnectWs() {
  wsStore.disconnect();
  wsStore.connect();
}
</script>

<div class="flex h-screen flex-col">
  <header
    role="toolbar"
    tabindex="-1"
    data-tauri-drag-region
    onmousedown={startDragging}
    class="relative flex h-[48px] w-full shrink-0 items-center border-b bg-background pl-[78px] pr-4 no-select"
  >
    <!-- Centered tab nav -->
    <div class="absolute left-1/2 -translate-x-1/2">
      <Tabs.Root
        value={getActiveTab($page.url.pathname)}
        onValueChange={(v) => { if (v) goto(v); }}
      >
        <Tabs.List>
          {#each tabItems as tab}
            <Tabs.Trigger value={tab.value}>
              {tab.label}
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>
    </div>

    <!-- Right: status + settings -->
    <div class="ml-auto flex items-center gap-2">
      {#if isTauri}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <button
              class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              <LiveIndicator connected={$wsStore.connected} />
              {$wsStore.connected ? 'Active' : 'Offline'}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-48">
            <DropdownMenu.Label>
              {$wsStore.connected ? 'Server active on port 3100' : 'Server offline'}
            </DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              onclick={restartServer}
              disabled={serverAction !== null}
            >
              <RotateCwIcon class={serverAction === 'restarting' ? 'animate-spin' : ''} />
              {serverAction === 'restarting' ? 'Restarting…' : 'Restart Server'}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onclick={stopServer}
              disabled={serverAction !== null}
              variant="destructive"
            >
              <SquareIcon />
              {serverAction === 'stopping' ? 'Stopping…' : 'Stop Server'}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {:else}
        <button
          onclick={reconnectWs}
          class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
          title={$wsStore.connected ? 'Connected' : 'Click to reconnect'}
        >
          <LiveIndicator connected={$wsStore.connected} />
          {#if $wsStore.connected}
            Active
          {:else}
            <WifiIcon class="size-3" />
            Reconnect
          {/if}
        </button>
      {/if}
      <button
        onclick={openSettingsWindow}
        class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Settings"
      >
        <SettingsIcon class="size-4" />
      </button>
    </div>
  </header>

  <main class="flex-1 overflow-auto overscroll-none">
    {@render children()}
  </main>
</div>
