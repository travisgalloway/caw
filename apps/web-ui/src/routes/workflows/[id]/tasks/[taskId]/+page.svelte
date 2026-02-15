<script lang="ts">
import { onMount } from 'svelte';
import { page } from '$app/stores';
import { api, type Task } from '$lib/api/client';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';

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
let loading = $state(true);
let error = $state<string | null>(null);

const workflowId = $derived($page.params.id);
const taskId = $derived($page.params.taskId);

onMount(async () => {
  try {
    const [taskRes, depsRes] = await Promise.all([
      api.getTask(taskId, true),
      fetch(`/api/tasks/${taskId}/dependencies`).then((r) => r.json()),
    ]);
    task = taskRes.data as typeof task;
    deps = depsRes.data;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
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
