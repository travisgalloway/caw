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

// Action button state
let actionLoading = $state<string | null>(null);
let actionError = $state<string | null>(null);
// TODO: Lock/unlock requires a registered session_id from the sessions table.
// For now, disable lock buttons until the web UI has session registration.
const browserSessionId: string | null = null;

// Valid workflow status transitions (matches core state machine in transitions.ts)
const WORKFLOW_TRANSITIONS: Record<string, string[]> = {
  planning: ['ready', 'abandoned'],
  ready: ['in_progress', 'abandoned'],
  in_progress: ['paused', 'completed', 'failed', 'abandoned'],
  paused: ['in_progress', 'abandoned'],
  failed: ['in_progress'],
};

const validTransitions = $derived(workflow ? (WORKFLOW_TRANSITIONS[workflow.status] ?? []) : []);

const isLocked = $derived(!!workflow?.locked_by_session_id);

// Add Task dialog state
let showAddTask = $state(false);
let addTaskName = $state('');
let addTaskDescription = $state('');
let addTaskParallelGroup = $state('');
let addTaskComplexity = $state('');
let addTaskDependsOn = $state('');
let addTaskError = $state<string | null>(null);
let addTaskSubmitting = $state(false);

// Delete confirmation state
let deleteTask = $state<Task | null>(null);
let deleteError = $state<string | null>(null);
let deleteSubmitting = $state(false);

const REMOVABLE_STATUSES = new Set(['pending', 'blocked', 'planning']);

const workflowId = $derived($page.params.id!);

async function handleLockToggle() {
  if (!workflow || !browserSessionId) return;
  actionLoading = 'lock';
  actionError = null;
  try {
    if (isLocked) {
      await api.unlockWorkflow(workflow.id, browserSessionId);
    } else {
      await api.lockWorkflow(workflow.id, browserSessionId);
    }
    await loadData();
  } catch (err) {
    actionError = err instanceof Error ? err.message : String(err);
  } finally {
    actionLoading = null;
  }
}

async function handleResume() {
  if (!workflow) return;
  actionLoading = 'resume';
  actionError = null;
  try {
    await api.updateWorkflowStatus(workflow.id, 'in_progress');
    await loadData();
  } catch (err) {
    actionError = err instanceof Error ? err.message : String(err);
  } finally {
    actionLoading = null;
  }
}

async function handleStatusChange(e: Event) {
  if (!workflow) return;
  const select = e.target as HTMLSelectElement;
  const newStatus = select.value;
  if (!newStatus) return;
  actionLoading = 'status';
  actionError = null;
  try {
    await api.updateWorkflowStatus(workflow.id, newStatus);
    await loadData();
  } catch (err) {
    actionError = err instanceof Error ? err.message : String(err);
  } finally {
    actionLoading = null;
    // Reset select to placeholder
    select.value = '';
  }
}

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

function openAddTask() {
  addTaskName = '';
  addTaskDescription = '';
  addTaskParallelGroup = '';
  addTaskComplexity = '';
  addTaskDependsOn = '';
  addTaskError = null;
  addTaskSubmitting = false;
  showAddTask = true;
}

async function handleAddTask() {
  if (!addTaskName.trim()) {
    addTaskError = 'Name is required';
    return;
  }
  addTaskError = null;
  addTaskSubmitting = true;
  try {
    const params: {
      name: string;
      description?: string;
      parallel_group?: string;
      estimated_complexity?: string;
      depends_on?: string[];
    } = { name: addTaskName.trim() };
    if (addTaskDescription.trim()) params.description = addTaskDescription.trim();
    if (addTaskParallelGroup.trim()) params.parallel_group = addTaskParallelGroup.trim();
    if (addTaskComplexity) params.estimated_complexity = addTaskComplexity;
    if (addTaskDependsOn.trim()) {
      params.depends_on = addTaskDependsOn
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    await api.addTask(workflowId, params);
    showAddTask = false;
    await loadData();
  } catch (err) {
    addTaskError = err instanceof Error ? err.message : String(err);
  } finally {
    addTaskSubmitting = false;
  }
}

async function handleDeleteTask() {
  if (!deleteTask) return;
  deleteError = null;
  deleteSubmitting = true;
  try {
    await api.removeTask(workflowId, deleteTask.id);
    deleteTask = null;
    await loadData();
  } catch (err) {
    deleteError = err instanceof Error ? err.message : String(err);
  } finally {
    deleteSubmitting = false;
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

<!-- Add Task Dialog -->
{#if showAddTask}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    aria-label="Add Task"
  >
    <div class="mx-4 w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <h3 class="mb-4 text-lg font-semibold">Add Task</h3>
      {#if addTaskError}
        <div class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {addTaskError}
        </div>
      {/if}
      <form
        onsubmit={(e) => { e.preventDefault(); handleAddTask(); }}
        class="space-y-3"
      >
        <div>
          <label for="task-name" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Name <span class="text-red-500">*</span>
          </label>
          <input
            id="task-name"
            type="text"
            bind:value={addTaskName}
            required
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Task name"
          />
        </div>
        <div>
          <label for="task-desc" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <textarea
            id="task-desc"
            bind:value={addTaskDescription}
            rows="3"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Optional description"
          ></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="task-group" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Parallel Group
            </label>
            <input
              id="task-group"
              type="text"
              bind:value={addTaskParallelGroup}
              class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g. group-a"
            />
          </div>
          <div>
            <label for="task-complexity" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Complexity
            </label>
            <select
              id="task-complexity"
              bind:value={addTaskComplexity}
              class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">-- Select --</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div>
          <label for="task-deps" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Depends On
          </label>
          <input
            id="task-deps"
            type="text"
            bind:value={addTaskDependsOn}
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Comma-separated task names"
          />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onclick={() => showAddTask = false}
            class="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={addTaskSubmitting}
            class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {addTaskSubmitting ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Dialog -->
{#if deleteTask}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    aria-label="Confirm Delete"
  >
    <div class="mx-4 w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <h3 class="mb-2 text-lg font-semibold">Delete Task</h3>
      <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Are you sure you want to delete <span class="font-medium text-gray-900 dark:text-gray-100">{deleteTask.name}</span>? Dependencies will be rewired automatically.
      </p>
      {#if deleteError}
        <div class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {deleteError}
        </div>
      {/if}
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={() => { deleteTask = null; deleteError = null; }}
          class="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={deleteSubmitting}
          onclick={handleDeleteTask}
          class="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {deleteSubmitting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}

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
        {#if isLocked}
          <span class="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">Locked</span>
        {/if}
      </div>

      <!-- Action buttons -->
      <div class="mt-3 flex items-center gap-2">
        <button
          class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors
            {isLocked
              ? 'border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
          disabled={actionLoading === 'lock' || !browserSessionId}
          onclick={handleLockToggle}
          title={browserSessionId ? undefined : 'Lock requires session registration (not yet implemented)'}
        >
          {#if actionLoading === 'lock'}
            <span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
          {:else}
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              {#if isLocked}
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              {/if}
            </svg>
          {/if}
          {isLocked ? 'Unlock' : 'Lock'}
        </button>

        {#if workflow.status === 'paused' || workflow.status === 'failed'}
          <button
            class="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 transition-colors hover:bg-green-100"
            disabled={actionLoading === 'resume'}
            onclick={handleResume}
          >
            {#if actionLoading === 'resume'}
              <span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
            {:else}
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            {/if}
            Resume
          </button>
        {/if}

        {#if validTransitions.length > 0}
          <select
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            disabled={actionLoading === 'status'}
            onchange={handleStatusChange}
          >
            <option value="">Change status…</option>
            {#each validTransitions as status}
              <option value={status}>{status.replace(/_/g, ' ')}</option>
            {/each}
          </select>
          {#if actionLoading === 'status'}
            <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></span>
          {/if}
        {/if}
      </div>

      {#if actionError}
        <div class="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      {/if}

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
      <div class="mb-3 flex justify-end">
        <button
          type="button"
          onclick={openAddTask}
          class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Task
        </button>
      </div>
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
              <th class="w-10 px-4 py-3 font-medium text-gray-500"></th>
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
                <td class="px-4 py-3">
                  {#if REMOVABLE_STATUSES.has(task.status) && !task.assigned_agent_id}
                    <button
                      type="button"
                      onclick={() => { deleteTask = task; deleteError = null; deleteSubmitting = false; }}
                      class="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                      title="Delete task"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                  {/if}
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
