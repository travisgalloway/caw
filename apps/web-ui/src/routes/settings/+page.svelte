<script lang="ts">
import { onMount } from 'svelte';
import { api, type ConfigResponse } from '$lib/api/client';

let config = $state<ConfigResponse | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);

onMount(async () => {
  try {
    const result = await api.getConfig();
    config = result.data;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to fetch configuration';
    console.error('Failed to fetch config:', err);
  } finally {
    loading = false;
  }
});

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'Not configured';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}
</script>

<div class="mx-auto max-w-2xl p-6">
  <h2 class="mb-6 text-2xl font-bold">Settings</h2>

  {#if loading}
    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div class="flex items-center justify-center">
        <p class="text-gray-500">Loading configuration...</p>
      </div>
    </div>
  {:else if error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
      <div class="flex items-center gap-2">
        <span class="text-red-600 dark:text-red-400">✗</span>
        <p class="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    </div>
  {:else if config}
    <!-- Server Configuration -->
    <div class="mb-6">
      <h3 class="mb-3 text-lg font-semibold">Server Configuration</h3>
      <div class="space-y-3">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <h4 class="font-medium">Transport</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">MCP server transport protocol</p>
            </div>
            <span class="font-mono text-sm text-gray-700 dark:text-gray-300">
              {formatValue(config.config.transport)}
            </span>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <h4 class="font-medium">Port</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">Server port number</p>
            </div>
            <span class="font-mono text-sm text-gray-700 dark:text-gray-300">
              {formatValue(config.config.port)}
            </span>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <h4 class="font-medium">Database Mode</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">Workflow database location</p>
            </div>
            <span class="font-mono text-sm text-gray-700 dark:text-gray-300">
              {formatValue(config.config.dbMode)}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Agent Configuration -->
    <div class="mb-6">
      <h3 class="mb-3 text-lg font-semibold">Agent Configuration</h3>
      <div class="space-y-3">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <h4 class="font-medium">Runtime</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">Default agent runtime</p>
            </div>
            <span class="font-mono text-sm text-gray-700 dark:text-gray-300">
              {formatValue((config.config.agent as { runtime?: string })?.runtime)}
            </span>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <h4 class="font-medium">Auto Setup</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">Automatically configure MCP integration</p>
            </div>
            <span class="font-mono text-sm text-gray-700 dark:text-gray-300">
              {formatValue((config.config.agent as { autoSetup?: boolean })?.autoSetup)}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Diagnostics -->
    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <h3 class="mb-2 font-medium">Configuration Paths</h3>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-600 dark:text-gray-400">Database:</span>
          <code class="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">{config.diagnostics.dbPath}</code>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600 dark:text-gray-400">Global config:</span>
          <code class="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">{config.diagnostics.globalConfigPath}</code>
        </div>
        {#if config.diagnostics.repoConfigPath}
          <div class="flex justify-between">
            <span class="text-gray-600 dark:text-gray-400">Repo config:</span>
            <code class="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">{config.diagnostics.repoConfigPath}</code>
          </div>
        {/if}
      </div>
      {#if config.diagnostics.warnings.length > 0}
        <div class="mt-3 space-y-1">
          {#each config.diagnostics.warnings as warning}
            <p class="text-sm text-amber-600 dark:text-amber-400">⚠ {warning}</p>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
