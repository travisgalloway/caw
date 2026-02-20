<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { api, type WorkflowSummary } from '$lib/api/client';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { wsStore } from '$lib/stores/ws';

let workflows = $state<WorkflowSummary[]>([]);
let total = $state(0);
let loading = $state(true);
let error = $state<string | null>(null);
let showAll = $state(false);
let pollInterval: ReturnType<typeof setInterval>;

const activeStatuses = 'planning,ready,in_progress,paused,awaiting_merge';

async function loadWorkflows() {
  try {
    const result = await api.listWorkflows({
      status: showAll ? undefined : activeStatuses,
      limit: 50,
    });
    workflows = result.data;
    total = result.meta?.total ?? result.data.length;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

onMount(() => {
  loadWorkflows();
  pollInterval = setInterval(loadWorkflows, 5000);
});

onDestroy(() => {
  clearInterval(pollInterval);
});

// Reload on WebSocket events
$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type === 'workflow:status') {
    loadWorkflows();
  }
});
</script>

<div class="p-6">
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Workflows</h2>
      <p class="text-sm text-gray-500">{total} workflow{total !== 1 ? 's' : ''}</p>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="rounded-md px-3 py-1.5 text-sm transition-colors
          {showAll
            ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}"
        onclick={() => { showAll = !showAll; loadWorkflows(); }}
      >
        {showAll ? 'All' : 'Active'}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <span class="text-gray-400">Loading...</span>
    </div>
  {:else if error}
    <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
      {error}
    </div>
  {:else if workflows.length === 0}
    <div class="flex flex-col items-center justify-center py-12 text-gray-400">
      <p class="text-lg">No workflows found</p>
      <p class="text-sm">Create a workflow via MCP or the CLI to get started.</p>
    </div>
  {:else}
    <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
          <tr>
            <th class="px-4 py-3 font-medium text-gray-500">Name</th>
            <th class="px-4 py-3 font-medium text-gray-500">Status</th>
            <th class="px-4 py-3 font-medium text-gray-500">Source</th>
            <th class="px-4 py-3 font-medium text-gray-500">Updated</th>
            <th class="px-4 py-3 font-medium text-gray-500">ID</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
          {#each workflows as wf}
            <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900">
              <td class="px-4 py-3">
                <a href="/workflows/{wf.id}" class="font-medium text-blue-600 hover:underline dark:text-blue-400">
                  {wf.name}
                </a>
              </td>
              <td class="px-4 py-3">
                <StatusBadge status={wf.status} />
              </td>
              <td class="px-4 py-3 text-gray-500">{wf.source_type}</td>
              <td class="px-4 py-3 text-gray-500">
                <RelativeTime timestamp={wf.updated_at} />
              </td>
              <td class="px-4 py-3 font-mono text-xs text-gray-400">{wf.id}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
