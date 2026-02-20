<script lang="ts">
import { onMount } from 'svelte';
import { api, type DiagnosticCheck } from '$lib/api/client';
import { wsStore } from '$lib/stores/ws';

let apiStatus = $state<'checking' | 'ok' | 'error'>('checking');
let wsStatus = $state<'checking' | 'ok' | 'error'>('checking');
let diagnostics = $state<DiagnosticCheck[]>([]);
let diagnosticsLoading = $state(true);

onMount(async () => {
  // Check API
  try {
    const res = await fetch('/health');
    apiStatus = res.ok ? 'ok' : 'error';
  } catch {
    apiStatus = 'error';
  }

  // Fetch diagnostics
  try {
    const result = await api.getDiagnostics();
    diagnostics = result.data.checks;
  } catch (error) {
    console.error('Failed to fetch diagnostics:', error);
  } finally {
    diagnosticsLoading = false;
  }
});

$effect(() => {
  wsStatus = $wsStore.connected ? 'ok' : 'error';
});

const statusIcon: Record<string, string> = {
  checking: '⏳',
  ok: '✓',
  error: '✗',
  pass: '✓',
  fail: '✗',
};

const statusColor: Record<string, string> = {
  checking: 'text-gray-400',
  ok: 'text-green-600',
  error: 'text-red-600',
  pass: 'text-green-600',
  fail: 'text-red-600',
};

const actionableHints: Record<string, string> = {
  Database: 'Run `caw init` to create the database',
  'MCP Server': 'Run `caw setup claude-code` to configure MCP integration',
  'CLAUDE.md': 'Add a CLAUDE.md file with caw integration section',
  'Config file': 'Run `caw init` to create the config file',
  Gitignore: 'Add `.caw/` to your .gitignore file',
};
</script>

<div class="mx-auto max-w-2xl p-6">
  <h2 class="mb-6 text-2xl font-bold">Setup Guide</h2>

  <!-- Server Checks -->
  <div class="mb-6">
    <h3 class="mb-3 text-lg font-semibold">Server Configuration</h3>
    <div class="space-y-3">
      {#if diagnosticsLoading}
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-medium">Loading diagnostics...</h4>
              <p class="text-sm text-gray-500">Checking server configuration</p>
            </div>
            <span class="font-mono text-sm font-bold {statusColor['checking']}">{statusIcon['checking']}</span>
          </div>
        </div>
      {:else}
        {#each diagnostics as check}
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <h4 class="font-medium">{check.name}</h4>
                <p class="text-sm text-gray-500 dark:text-gray-400">{check.message}</p>
                {#if check.status === 'fail' && actionableHints[check.name]}
                  <p class="mt-1 text-sm text-amber-600 dark:text-amber-400">
                    💡 {actionableHints[check.name]}
                  </p>
                {/if}
              </div>
              <span class="ml-4 font-mono text-sm font-bold {statusColor[check.status]}">{statusIcon[check.status]}</span>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Connection Checks -->
  <div class="mb-6">
    <h3 class="mb-3 text-lg font-semibold">Connection Status</h3>
    <div class="space-y-3">
      <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-medium">API Server</h4>
            <p class="text-sm text-gray-500 dark:text-gray-400">REST API at /api/*</p>
          </div>
          <span class="font-mono text-sm font-bold {statusColor[apiStatus]}">{statusIcon[apiStatus]}</span>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-medium">WebSocket</h4>
            <p class="text-sm text-gray-500 dark:text-gray-400">Real-time updates at /ws</p>
          </div>
          <span class="font-mono text-sm font-bold {statusColor[wsStatus]}">{statusIcon[wsStatus]}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Quick Start -->
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
