<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { type Agent, api, type WorkflowSummary } from '$lib/api/client';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { wsStore } from '$lib/stores/ws';

let agents = $state<Agent[]>([]);
let workflows = $state<WorkflowSummary[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let pollInterval: ReturnType<typeof setInterval>;

// Filter state
let statusFilter = $state('');
let runtimeFilter = $state('');
let roleFilter = $state('');
let workflowFilter = $state('');

// Compute filtered agents
const filteredAgents = $derived.by(() => {
  let result = agents;
  if (statusFilter) result = result.filter((a) => a.status === statusFilter);
  if (runtimeFilter) result = result.filter((a) => a.runtime === runtimeFilter);
  if (roleFilter) result = result.filter((a) => a.role === roleFilter);
  if (workflowFilter) result = result.filter((a) => a.workflow_id === workflowFilter);
  return result;
});

// Compute stats
const stats = $derived.by(() => {
  const total = agents.length;
  const online = agents.filter((a) => a.status === 'online').length;
  const busy = agents.filter((a) => a.status === 'busy').length;
  const offline = agents.filter((a) => a.status === 'offline').length;
  return { total, online, busy, offline };
});

// Get unique values for filter dropdowns
const uniqueStatuses = $derived.by(() => [...new Set(agents.map((a) => a.status))].sort());
const uniqueRuntimes = $derived.by(() => [...new Set(agents.map((a) => a.runtime))].sort());
const uniqueRoles = $derived.by(() => [...new Set(agents.map((a) => a.role))].sort());

async function loadData() {
  try {
    const [agentsRes, workflowsRes] = await Promise.all([
      api.listAgents(),
      api.listWorkflows({ status: 'in_progress' }),
    ]);
    agents = agentsRes.data;
    workflows = workflowsRes.data;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

function resetFilters() {
  statusFilter = '';
  runtimeFilter = '';
  roleFilter = '';
  workflowFilter = '';
}

onMount(() => {
  loadData();
  pollInterval = setInterval(loadData, 5000);
  wsStore.subscribeChannel('global');
});

onDestroy(() => {
  clearInterval(pollInterval);
  wsStore.unsubscribeChannel('global');
});

// Reload on WebSocket events
$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type?.startsWith('agent:')) {
    loadData();
  }
});
</script>

<div class="p-6">
  <div class="mb-6">
    <h2 class="text-2xl font-bold">Agents</h2>
    <p class="mt-1 text-sm text-gray-500">All agents across workflows</p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <span class="text-gray-400">Loading...</span>
    </div>
  {:else if error}
    <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {:else}
    <!-- Summary Stats -->
    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div class="text-sm text-gray-500">Total Agents</div>
        <div class="mt-1 text-2xl font-bold">{stats.total}</div>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div class="text-sm text-gray-500">Online</div>
        <div class="mt-1 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-green-600">{stats.online}</span>
          <span class="h-2 w-2 rounded-full bg-green-500"></span>
        </div>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div class="text-sm text-gray-500">Busy</div>
        <div class="mt-1 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-blue-600">{stats.busy}</span>
          <span class="h-2 w-2 rounded-full bg-blue-500"></span>
        </div>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div class="text-sm text-gray-500">Offline</div>
        <div class="mt-1 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-gray-400">{stats.offline}</span>
          <span class="h-2 w-2 rounded-full bg-gray-400"></span>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <label for="status-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
        <select
          id="status-filter"
          bind:value={statusFilter}
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All</option>
          {#each uniqueStatuses as status}
            <option value={status}>{status}</option>
          {/each}
        </select>
      </div>

      <div class="flex items-center gap-2">
        <label for="runtime-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">Runtime:</label>
        <select
          id="runtime-filter"
          bind:value={runtimeFilter}
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All</option>
          {#each uniqueRuntimes as runtime}
            <option value={runtime}>{runtime}</option>
          {/each}
        </select>
      </div>

      <div class="flex items-center gap-2">
        <label for="role-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">Role:</label>
        <select
          id="role-filter"
          bind:value={roleFilter}
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All</option>
          {#each uniqueRoles as role}
            <option value={role}>{role}</option>
          {/each}
        </select>
      </div>

      <div class="flex items-center gap-2">
        <label for="workflow-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">Workflow:</label>
        <select
          id="workflow-filter"
          bind:value={workflowFilter}
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All</option>
          {#each workflows as wf}
            <option value={wf.id}>{wf.name}</option>
          {/each}
        </select>
      </div>

      {#if statusFilter || runtimeFilter || roleFilter || workflowFilter}
        <button
          type="button"
          onclick={resetFilters}
          class="text-sm text-blue-600 hover:underline"
        >
          Reset filters
        </button>
      {/if}
    </div>

    <!-- Agent List -->
    {#if filteredAgents.length === 0}
      <p class="py-8 text-center text-gray-400">
        {agents.length === 0 ? 'No agents registered.' : 'No agents match the selected filters.'}
      </p>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {#each filteredAgents as agent}
          <a
            href="/agents/{agent.id}"
            class="rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium">{agent.name}</span>
              <StatusBadge status={agent.status} />
            </div>
            <div class="mt-2 space-y-1 text-xs text-gray-400">
              <p>Runtime: {agent.runtime}</p>
              <p>Role: {agent.role}</p>
              {#if agent.workflow_id}
                <p class="truncate" title={agent.workflow_id}>
                  Workflow: <span class="font-mono">{agent.workflow_id}</span>
                </p>
              {/if}
              {#if agent.current_task_id}
                <p class="truncate" title={agent.current_task_id}>
                  Task: <span class="font-mono">{agent.current_task_id}</span>
                </p>
              {/if}
              <p>Last heartbeat: <RelativeTime timestamp={agent.last_heartbeat} /></p>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</div>
