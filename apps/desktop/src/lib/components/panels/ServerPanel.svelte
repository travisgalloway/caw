<script lang="ts">
import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
import SquareIcon from '@lucide/svelte/icons/square';
import WifiIcon from '@lucide/svelte/icons/wifi';
import { onMount } from 'svelte';
import { api, type DiagnosticsResponse } from '$lib/api/client';
import LiveIndicator from '$lib/components/LiveIndicator.svelte';
import { Button } from '$lib/components/ui/button/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';
import { wsStore } from '$lib/stores/ws';

interface Props {
  isTauri: boolean;
  restartServer?: () => Promise<void>;
  stopServer?: () => Promise<void>;
  serverAction?: 'restarting' | 'stopping' | null;
}

const { isTauri, restartServer, stopServer, serverAction = null }: Props = $props();

let diagnostics = $state<DiagnosticsResponse | null>(null);
let diagnosticsError = $state<string | null>(null);

function reconnectWs() {
  wsStore.disconnect();
  wsStore.connect();
}

async function loadDiagnostics() {
  try {
    diagnosticsError = null;
    diagnostics = await api.getDiagnostics();
  } catch (e) {
    diagnosticsError = e instanceof Error ? e.message : 'Failed to load diagnostics';
  }
}

onMount(() => {
  loadDiagnostics();
});
</script>

<div class="space-y-4 p-4">
  <div class="space-y-1">
    <h3 class="text-sm font-semibold">Server Status</h3>
    <div class="space-y-2 text-xs">
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">WebSocket</span>
        <span class="flex items-center gap-1.5">
          <LiveIndicator connected={$wsStore.connected} />
          {$wsStore.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">API</span>
        <span class="flex items-center gap-1.5">
          <LiveIndicator connected={diagnostics?.allPassed ?? false} />
          {diagnostics?.allPassed ? 'Healthy' : 'Unhealthy'}
        </span>
      </div>
    </div>
  </div>

  <Separator />

  {#if diagnostics}
    <div class="space-y-2">
      <h3 class="text-sm font-semibold">Diagnostics</h3>
      <div class="space-y-1.5 text-xs">
        {#each diagnostics.checks as check}
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-muted-foreground">{check.name}</span>
            <span class={check.status === 'pass' ? 'text-green-600' : 'text-red-500'}>
              {check.status === 'pass' ? 'Pass' : 'Fail'}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {:else if diagnosticsError}
    <p class="text-xs text-red-500">{diagnosticsError}</p>
  {:else}
    <p class="text-xs text-muted-foreground">Loading diagnostics...</p>
  {/if}

  <Separator />

  <div class="space-y-2">
    {#if isTauri}
      <Button
        variant="outline"
        size="sm"
        class="w-full justify-start"
        onclick={restartServer}
        disabled={serverAction !== null}
      >
        <RotateCwIcon class={`size-4 ${serverAction === 'restarting' ? 'animate-spin' : ''}`} />
        {serverAction === 'restarting' ? 'Restarting...' : 'Restart Server'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="w-full justify-start text-destructive"
        onclick={stopServer}
        disabled={serverAction !== null}
      >
        <SquareIcon class="size-4" />
        {serverAction === 'stopping' ? 'Stopping...' : 'Stop Server'}
      </Button>
    {:else}
      <Button
        variant="outline"
        size="sm"
        class="w-full justify-start"
        onclick={reconnectWs}
      >
        <WifiIcon class="size-4" />
        Reconnect
      </Button>
    {/if}
  </div>
</div>
