<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { page } from '$app/stores';
import {
  type Agent,
  api,
  type Message,
  type ProgressResult,
  type Task,
  type Workflow,
  type Workspace,
} from '$lib/api/client';
import ProgressBar from '$lib/components/ProgressBar.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { wsStore } from '$lib/stores/ws';

let workflow = $state<Workflow | null>(null);
let progress = $state<ProgressResult | null>(null);
let agents = $state<Agent[]>([]);
let messages = $state<Message[]>([]);
let workspaces = $state<Workspace[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let activeTab = $state<'tasks' | 'agents' | 'messages' | 'workspaces'>('tasks');
let pollInterval: ReturnType<typeof setInterval>;

const workflowId = $derived($page.params.id);

async function loadData() {
  try {
    const [wfRes, progressRes, agentsRes, msgRes, wsRes] = await Promise.all([
      api.getWorkflow(workflowId),
      api.getWorkflowProgress(workflowId),
      api.listAgents({ workflow_id: workflowId }),
      api.listMessages({ limit: 20 }),
      api.listWorkspaces(workflowId),
    ]);
    workflow = wfRes.data;
    progress = progressRes.data;
    agents = agentsRes.data;
    messages = msgRes.data;
    workspaces = wsRes.data;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
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
  if (
    event?.type?.startsWith('workflow:') ||
    event?.type?.startsWith('task:') ||
    event?.type?.startsWith('agent:')
  ) {
    loadData();
  }
});

const completedTasks = $derived(
  progress ? (progress.by_status['completed'] ?? 0) + (progress.by_status['skipped'] ?? 0) : 0,
);
</script>

<div class="p-6">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <span class="text-gray-400">Loading...</span>
    </div>
  {:else if error}
    <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {:else if workflow}
    <!-- Header -->
    <div class="mb-6">
      <div class="mb-1 flex items-center gap-3">
        <a href="/" class="text-sm text-gray-400 hover:text-gray-600">&larr; Workflows</a>
      </div>
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold">{workflow.name}</h2>
        <StatusBadge status={workflow.status} />
        {#if workflow.locked_by_session_id}
          <span class="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">Locked</span>
        {/if}
      </div>
      {#if workflow.plan_summary}
        <p class="mt-1 text-sm text-gray-500">{workflow.plan_summary}</p>
      {/if}
      {#if progress}
        <div class="mt-3 max-w-md">
          <ProgressBar completed={completedTasks} total={progress.total_tasks} />
        </div>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="mb-4 border-b border-gray-200 dark:border-gray-800">
      <nav class="flex gap-4">
        {#each ['tasks', 'agents', 'messages', 'workspaces'] as tab}
          <button
            class="border-b-2 px-1 pb-2 text-sm font-medium transition-colors
              {activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
            onclick={() => activeTab = tab as typeof activeTab}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {#if tab === 'tasks' && progress}
              <span class="ml-1 text-xs text-gray-400">({progress.total_tasks})</span>
            {:else if tab === 'agents'}
              <span class="ml-1 text-xs text-gray-400">({agents.length})</span>
            {:else if tab === 'messages'}
              <span class="ml-1 text-xs text-gray-400">({messages.length})</span>
            {:else if tab === 'workspaces'}
              <span class="ml-1 text-xs text-gray-400">({workspaces.length})</span>
            {/if}
          </button>
        {/each}
      </nav>
    </div>

    <!-- Tab content -->
    {#if activeTab === 'tasks'}
      <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
            <tr>
              <th class="px-4 py-3 font-medium text-gray-500">#</th>
              <th class="px-4 py-3 font-medium text-gray-500">Name</th>
              <th class="px-4 py-3 font-medium text-gray-500">Status</th>
              <th class="px-4 py-3 font-medium text-gray-500">Agent</th>
              <th class="px-4 py-3 font-medium text-gray-500">Group</th>
              <th class="px-4 py-3 font-medium text-gray-500">Updated</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            {#each workflow.tasks as task}
              <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900">
                <td class="px-4 py-3 tabular-nums text-gray-400">{task.sequence}</td>
                <td class="px-4 py-3">
                  <a
                    href="/workflows/{workflowId}/tasks/{task.id}"
                    class="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {task.name}
                  </a>
                  {#if task.description}
                    <p class="mt-0.5 truncate text-xs text-gray-400" title={task.description}>
                      {task.description}
                    </p>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  <StatusBadge status={task.status} />
                </td>
                <td class="px-4 py-3 font-mono text-xs text-gray-400">
                  {task.assigned_agent_id ?? '—'}
                </td>
                <td class="px-4 py-3 text-xs text-gray-400">{task.parallel_group ?? '—'}</td>
                <td class="px-4 py-3 text-gray-500">
                  <RelativeTime timestamp={task.updated_at} />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if activeTab === 'agents'}
      {#if agents.length === 0}
        <p class="py-8 text-center text-gray-400">No agents registered for this workflow.</p>
      {:else}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each agents as agent}
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
                {#if agent.current_task_id}
                  <p>Task: <span class="font-mono">{agent.current_task_id}</span></p>
                {/if}
                <p>Last heartbeat: <RelativeTime timestamp={agent.last_heartbeat} /></p>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'messages'}
      {#if messages.length === 0}
        <p class="py-8 text-center text-gray-400">No messages.</p>
      {:else}
        <div class="space-y-2">
          {#each messages as msg}
            <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium dark:bg-gray-800">
                    {msg.message_type}
                  </span>
                  {#if msg.subject}
                    <span class="text-sm font-medium">{msg.subject}</span>
                  {/if}
                </div>
                <span class="text-xs text-gray-400">
                  <RelativeTime timestamp={msg.created_at} />
                </span>
              </div>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{msg.body}</p>
              <div class="mt-1 flex gap-2 text-xs text-gray-400">
                <span>From: {msg.sender_id ?? 'system'}</span>
                <span>To: {msg.recipient_id}</span>
                <StatusBadge status={msg.status} />
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'workspaces'}
      {#if workspaces.length === 0}
        <p class="py-8 text-center text-gray-400">No workspaces.</p>
      {:else}
        <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
              <tr>
                <th class="px-4 py-3 font-medium text-gray-500">Path</th>
                <th class="px-4 py-3 font-medium text-gray-500">Branch</th>
                <th class="px-4 py-3 font-medium text-gray-500">Status</th>
                <th class="px-4 py-3 font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              {#each workspaces as ws}
                <tr>
                  <td class="px-4 py-3 font-mono text-xs">{ws.path}</td>
                  <td class="px-4 py-3 text-xs">{ws.branch}</td>
                  <td class="px-4 py-3"><StatusBadge status={ws.status} /></td>
                  <td class="px-4 py-3 text-gray-500">
                    <RelativeTime timestamp={ws.created_at} />
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  {/if}
</div>
