<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { page } from '$app/stores';
import { type Agent, api, type Task } from '$lib/api/client';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { wsStore } from '$lib/stores/ws';

let task = $state<
  | (Task & {
      checkpoints?: Array<{
        id: string;
        sequence: number;
        checkpoint_type: string;
        summary: string;
        created_at: number;
      }>;
    })
  | null
>(null);
let deps = $state<{
  dependencies: Array<{ task_id: string; depends_on_id: string; dependency_type: string }>;
  dependents: Array<{ task_id: string; depends_on_id: string; dependency_type: string }>;
} | null>(null);
let agents = $state<Agent[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let pollInterval: ReturnType<typeof setInterval>;

// Status transition state
let statusAction = $state<string | null>(null);
let statusOutcome = $state('');
let statusError = $state('');
let statusSubmitting = $state(false);
let statusActionError = $state<string | null>(null);

// Claim/release state
let claimAgentId = $state('');
let claimSubmitting = $state(false);
let claimError = $state<string | null>(null);

const workflowId = $derived($page.params.id!);
const taskId = $derived($page.params.taskId!);

// Valid task transitions
const TASK_TRANSITIONS: Record<string, string[]> = {
  pending: ['planning', 'in_progress'],
  planning: ['in_progress'],
  in_progress: ['completed', 'failed', 'paused'],
  paused: ['in_progress'],
  failed: ['in_progress'],
};

const validNextStates = $derived(task ? (TASK_TRANSITIONS[task.status] ?? []) : []);

async function loadData() {
  try {
    const [taskRes, depsRes, agentsRes] = await Promise.all([
      api.getTask(taskId, true),
      fetch(`/api/tasks/${taskId}/dependencies`).then((r) => r.json()),
      api.listAgents({ workflow_id: workflowId }),
    ]);
    task = taskRes.data as typeof task;
    deps = depsRes.data;
    agents = agentsRes.data;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

async function handleStatusChange() {
  if (!statusAction) return;
  statusActionError = null;
  statusSubmitting = true;
  try {
    const params: { outcome?: string; error?: string } = {};
    if (statusAction === 'completed' && statusOutcome.trim()) {
      params.outcome = statusOutcome.trim();
    }
    if (statusAction === 'failed' && statusError.trim()) {
      params.error = statusError.trim();
    }
    await api.updateTaskStatus(taskId, statusAction, params);
    statusAction = null;
    statusOutcome = '';
    statusError = '';
    await loadData();
  } catch (err) {
    statusActionError = err instanceof Error ? err.message : String(err);
  } finally {
    statusSubmitting = false;
  }
}

async function handleClaim() {
  if (!claimAgentId.trim()) {
    claimError = 'Agent ID is required';
    return;
  }
  claimError = null;
  claimSubmitting = true;
  try {
    await api.claimTask(taskId, claimAgentId.trim());
    claimAgentId = '';
    await loadData();
  } catch (err) {
    claimError = err instanceof Error ? err.message : String(err);
  } finally {
    claimSubmitting = false;
  }
}

async function handleRelease() {
  if (!task?.assigned_agent_id) return;
  claimError = null;
  claimSubmitting = true;
  try {
    await api.releaseTask(taskId, task.assigned_agent_id);
    await loadData();
  } catch (err) {
    claimError = err instanceof Error ? err.message : String(err);
  } finally {
    claimSubmitting = false;
  }
}

onMount(() => {
  loadData();
  pollInterval = setInterval(loadData, 5000);
  wsStore.subscribeChannel(`workflow:${workflowId}`);
});

onDestroy(() => {
  clearInterval(pollInterval);
  wsStore.unsubscribeChannel(`workflow:${workflowId}`);
});

// Reload on WebSocket events
$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type?.startsWith('task:') || event?.type?.startsWith('workflow:')) {
    loadData();
  }
});
</script>

<div class="p-6">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <span class="text-gray-400">Loading...</span>
    </div>
  {:else if error}
    <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  {:else if task}
    <!-- Breadcrumb -->
    <div class="mb-4 flex items-center gap-2 text-sm text-gray-400">
      <a href="/" class="hover:text-gray-600">Workflows</a>
      <span>/</span>
      <a href="/workflows/{workflowId}" class="hover:text-gray-600">{workflowId}</a>
      <span>/</span>
      <span class="text-gray-600">Tasks</span>
      <span>/</span>
      <span class="text-gray-600">{task.name}</span>
    </div>

    <!-- Header -->
    <div class="mb-6">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold">{task.name}</h2>
        <StatusBadge status={task.status} />
      </div>
      {#if task.description}
        <p class="mt-1 text-sm text-gray-500">{task.description}</p>
      {/if}
    </div>

    <!-- Action Controls -->
    <div class="mb-6 space-y-4">
      <!-- Status Transitions -->
      {#if validNextStates.length > 0}
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h3 class="mb-3 text-sm font-semibold text-gray-600">Change Status</h3>
          {#if statusActionError}
            <div class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              {statusActionError}
            </div>
          {/if}
          <div class="flex flex-wrap gap-2">
            {#each validNextStates as nextStatus}
              <button
                type="button"
                onclick={() => {
                  statusAction = nextStatus;
                  statusActionError = null;
                  statusOutcome = '';
                  statusError = '';
                }}
                class="rounded border px-3 py-1.5 text-sm font-medium transition-colors
                  {statusAction === nextStatus
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'}"
              >
                {nextStatus}
              </button>
            {/each}
          </div>
          {#if statusAction === 'completed'}
            <div class="mt-3">
              <label for="outcome" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Outcome
              </label>
              <textarea
                id="outcome"
                bind:value={statusOutcome}
                rows="3"
                class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                placeholder="Describe the outcome..."
              ></textarea>
            </div>
          {/if}
          {#if statusAction === 'failed'}
            <div class="mt-3">
              <label for="error-detail" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Error Detail
              </label>
              <textarea
                id="error-detail"
                bind:value={statusError}
                rows="3"
                class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                placeholder="Describe what went wrong..."
              ></textarea>
            </div>
          {/if}
          {#if statusAction}
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                disabled={statusSubmitting}
                onclick={handleStatusChange}
                class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {statusSubmitting ? 'Updating...' : `Set ${statusAction}`}
              </button>
              <button
                type="button"
                onclick={() => { statusAction = null; statusActionError = null; }}
                class="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Claim / Release -->
      <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h3 class="mb-3 text-sm font-semibold text-gray-600">Agent Assignment</h3>
        {#if claimError}
          <div class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {claimError}
          </div>
        {/if}
        {#if task.assigned_agent_id}
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Assigned to: <span class="font-mono font-medium">{task.assigned_agent_id}</span>
            </span>
            <button
              type="button"
              disabled={claimSubmitting}
              onclick={handleRelease}
              class="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
            >
              {claimSubmitting ? 'Releasing...' : 'Release'}
            </button>
          </div>
        {:else}
          <div class="flex items-center gap-2">
            {#if agents.length > 0}
              <select
                bind:value={claimAgentId}
                class="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Select agent...</option>
                {#each agents as agent}
                  <option value={agent.id}>{agent.name} ({agent.id})</option>
                {/each}
              </select>
            {:else}
              <input
                type="text"
                bind:value={claimAgentId}
                placeholder="Agent ID"
                class="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            {/if}
            <button
              type="button"
              disabled={claimSubmitting || !claimAgentId.trim()}
              onclick={handleClaim}
              class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {claimSubmitting ? 'Claiming...' : 'Claim'}
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Metadata grid -->
    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p class="text-xs font-medium text-gray-400">Sequence</p>
        <p class="mt-1 text-lg font-semibold">{task.sequence}</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p class="text-xs font-medium text-gray-400">Parallel Group</p>
        <p class="mt-1 text-lg font-semibold">{task.parallel_group ?? '—'}</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p class="text-xs font-medium text-gray-400">Assigned Agent</p>
        <p class="mt-1 font-mono text-sm">{task.assigned_agent_id ?? '—'}</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p class="text-xs font-medium text-gray-400">Updated</p>
        <p class="mt-1 text-sm"><RelativeTime timestamp={task.updated_at} /></p>
      </div>
    </div>

    <!-- Plan -->
    {#if task.plan}
      <div class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-gray-600">Plan</h3>
        <pre class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-900">{task.plan}</pre>
      </div>
    {/if}

    <!-- Outcome -->
    {#if task.outcome}
      <div class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-gray-600">Outcome</h3>
        <pre class="rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-800 dark:bg-green-950">{task.outcome}</pre>
      </div>
    {/if}

    {#if task.outcome_detail}
      <div class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-gray-600">Error Detail</h3>
        <pre class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-800 dark:bg-red-950">{task.outcome_detail}</pre>
      </div>
    {/if}

    <!-- Dependencies -->
    {#if deps}
      <div class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-gray-600">Dependencies</h3>
        {#if deps.dependencies.length === 0 && deps.dependents.length === 0}
          <p class="text-sm text-gray-400">No dependencies.</p>
        {:else}
          <div class="grid gap-4 sm:grid-cols-2">
            {#if deps.dependencies.length > 0}
              <div>
                <p class="text-xs font-medium text-gray-400">Depends on ({deps.dependencies.length})</p>
                <ul class="mt-1 space-y-1">
                  {#each deps.dependencies as dep}
                    <li class="font-mono text-xs text-gray-500">{dep.depends_on_id}</li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if deps.dependents.length > 0}
              <div>
                <p class="text-xs font-medium text-gray-400">Blocks ({deps.dependents.length})</p>
                <ul class="mt-1 space-y-1">
                  {#each deps.dependents as dep}
                    <li class="font-mono text-xs text-gray-500">{dep.task_id}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Checkpoints -->
    {#if task.checkpoints && task.checkpoints.length > 0}
      <div>
        <h3 class="mb-2 text-sm font-semibold text-gray-600">Checkpoints ({task.checkpoints.length})</h3>
        <div class="space-y-2">
          {#each task.checkpoints as cp}
            <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium dark:bg-gray-800">
                    #{cp.sequence}
                  </span>
                  <span class="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {cp.checkpoint_type}
                  </span>
                </div>
                <span class="text-xs text-gray-400">
                  <RelativeTime timestamp={cp.created_at} />
                </span>
              </div>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{cp.summary}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
