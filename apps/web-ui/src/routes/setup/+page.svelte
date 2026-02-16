<script lang="ts">
let apiStatus = $state<'checking' | 'ok' | 'error'>('checking');
let wsStatus = $state<'checking' | 'ok' | 'error'>('checking');

import { onMount } from 'svelte';
import { wsStore } from '$lib/stores/ws';

onMount(async () => {
  // Check API
  try {
    const res = await fetch('/health');
    apiStatus = res.ok ? 'ok' : 'error';
  } catch {
    apiStatus = 'error';
  }
});

$effect(() => {
  wsStatus = $wsStore.connected ? 'ok' : 'error';
});

const statusIcon: Record<string, string> = {
  checking: '...',
  ok: 'OK',
  error: 'FAIL',
};

const statusColor: Record<string, string> = {
  checking: 'text-gray-400',
  ok: 'text-green-600',
  error: 'text-red-600',
};
</script>

<div class="mx-auto max-w-2xl p-6">
  <h2 class="mb-6 text-2xl font-bold">Setup</h2>

  <div class="space-y-4">
    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-medium">API Server</h3>
          <p class="text-sm text-gray-500">REST API at /api/*</p>
        </div>
        <span class="font-mono text-sm font-bold {statusColor[apiStatus]}">{statusIcon[apiStatus]}</span>
      </div>
    </div>

    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-medium">WebSocket</h3>
          <p class="text-sm text-gray-500">Real-time updates at /ws</p>
        </div>
        <span class="font-mono text-sm font-bold {statusColor[wsStatus]}">{statusIcon[wsStatus]}</span>
      </div>
    </div>

    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <h3 class="mb-2 font-medium">Quick Start</h3>
      <ol class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
        <li>1. Initialize caw: <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">caw init</code></li>
        <li>2. Start the web server: <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">caw --web-ui</code></li>
        <li>3. Create a workflow via MCP or CLI</li>
        <li>4. View workflow progress in the dashboard</li>
      </ol>
    </div>
  </div>
</div>
