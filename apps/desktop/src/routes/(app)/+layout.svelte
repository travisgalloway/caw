<script lang="ts">
import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
import XIcon from '@lucide/svelte/icons/x';
import { onDestroy, onMount, setContext } from 'svelte';
import { page } from '$app/stores';
import { api } from '$lib/api/client';
import AppSidebar from '$lib/components/AppSidebar.svelte';
import LiveIndicator from '$lib/components/LiveIndicator.svelte';
import ServerPanel from '$lib/components/panels/ServerPanel.svelte';
import SettingsSidebar from '$lib/components/SettingsSidebar.svelte';
import { Button } from '$lib/components/ui/button/index.js';
import * as Sidebar from '$lib/components/ui/sidebar/index.js';
import { RightPanelState } from '$lib/stores/right-panel.svelte';
import { SidebarData } from '$lib/stores/sidebar-data.svelte';
import { wsStore } from '$lib/stores/ws';

const { children } = $props();

let isTauri = $state(false);
let serverAction = $state<'restarting' | 'stopping' | null>(null);
let initChecked = $state(false);
let initialized = $state(true);
let initRunning = $state(false);

const sidebarData = new SidebarData();
const isSettings = $derived($page.url.pathname.startsWith('/settings'));

let sidebarOpen = $state(true);
const rightPanel = new RightPanelState();
setContext('rightPanel', rightPanel);

const headerPaddingClass = $derived(isTauri ? 'pl-[80px]' : '');

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
    // Not running in Tauri
  }
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

function toggleServerPanel() {
  if (rightPanel.visible && rightPanel.component === ServerPanel) {
    rightPanel.hide();
  } else {
    rightPanel.show(
      ServerPanel,
      {
        isTauri,
        restartServer,
        stopServer,
        serverAction,
      },
      'Server Info',
    );
  }
}

$effect(() => {
  const action = serverAction;
  if (rightPanel.visible && rightPanel.component === ServerPanel) {
    rightPanel.props = { ...(rightPanel.props ?? {}), serverAction: action };
  }
});

async function checkInit() {
  try {
    const result = await api.getInitStatus();
    initialized = result.data.initialized;
  } catch {
    // Server may not be ready yet
  } finally {
    initChecked = true;
  }
}

async function handleInit() {
  if (initRunning || !isTauri) return;
  initRunning = true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('run_init');
    await checkInit();
  } catch {
    // Init may have failed
  } finally {
    initRunning = false;
  }
}

onMount(() => {
  sidebarData.startPolling();
  checkInit();
});

onDestroy(() => {
  sidebarData.stopPolling();
});

// Refresh sidebar on WS events
let lastEventRef: unknown = null;
$effect(() => {
  const event = $wsStore.lastEvent;
  if (event && event !== lastEventRef) {
    lastEventRef = event;
    sidebarData.handleWsEvent(event as { type: string });
  }
});
</script>

<Sidebar.Provider class="h-screen !flex-col !min-h-0" bind:open={sidebarOpen}>
  <header
    role="toolbar"
    tabindex="-1"
    data-tauri-drag-region
    onmousedown={startDragging}
    class="flex h-12 w-full shrink-0 items-center border-b bg-background px-3 no-select {headerPaddingClass}"
  >
    <Sidebar.Trigger class="size-7" />
    <div class="ml-auto flex items-center gap-2">
      <button
        onclick={toggleServerPanel}
        class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
        title={$wsStore.connected ? 'Server active' : 'Server offline'}
      >
        <LiveIndicator connected={$wsStore.connected} />
        {$wsStore.connected ? 'Active' : 'Offline'}
      </button>
    </div>
  </header>

  <div class="flex flex-1 min-h-0 w-full">
    {#if isSettings}
      <SettingsSidebar {isTauri} />
    {:else}
      <AppSidebar data={sidebarData} {isTauri} />
    {/if}

    <Sidebar.Inset>
      <div class="flex flex-1 min-w-0 overflow-hidden">
        <div class="flex-1 overflow-auto overscroll-none min-w-0">
          {#if initChecked && !initialized}
            <div class="flex items-center gap-3 border-b bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              <AlertTriangleIcon class="size-4 shrink-0" />
              <span class="flex-1">caw is not initialized. Run <code class="rounded bg-amber-100 px-1 dark:bg-amber-900">caw init</code> in your terminal to set up.</span>
              {#if isTauri}
                <Button size="sm" variant="outline" onclick={handleInit} disabled={initRunning}>
                  {initRunning ? 'Initializing...' : 'Initialize'}
                </Button>
              {/if}
            </div>
          {/if}
          {@render children()}
        </div>
        {#if rightPanel.visible && rightPanel.component}
          <aside class="w-72 shrink-0 overflow-y-auto border-l bg-background">
            <div class="flex h-10 items-center justify-between border-b px-3">
              <span class="text-xs font-semibold">{rightPanel.title || 'Panel'}</span>
              <Button variant="ghost" size="icon" class="size-6" onclick={() => rightPanel.hide()}>
                <XIcon class="size-3.5" />
              </Button>
            </div>
            <rightPanel.component {...rightPanel.props} />
          </aside>
        {/if}
      </div>
    </Sidebar.Inset>
  </div>
</Sidebar.Provider>
