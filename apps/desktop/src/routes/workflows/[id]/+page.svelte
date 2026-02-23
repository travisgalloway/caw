<script lang="ts">
import BotIcon from '@lucide/svelte/icons/bot';
import FolderIcon from '@lucide/svelte/icons/folder';
import ListIcon from '@lucide/svelte/icons/list';
import LockIcon from '@lucide/svelte/icons/lock';
import MailIcon from '@lucide/svelte/icons/mail';
import PlusIcon from '@lucide/svelte/icons/plus';
import SendIcon from '@lucide/svelte/icons/send';
import Trash2Icon from '@lucide/svelte/icons/trash-2';
import UnlockIcon from '@lucide/svelte/icons/unlock';
import { onDestroy, onMount } from 'svelte';
import { page } from '$app/stores';
import {
  type Agent,
  api,
  type Message,
  type ProgressResult,
  type Task,
  type Workflow,
  type WorkflowDependencies,
  type Workspace,
} from '$lib/api/client';
import EmptyState from '$lib/components/EmptyState.svelte';
import ExecutionPanel from '$lib/components/ExecutionPanel.svelte';
import MessageComposer from '$lib/components/MessageComposer.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import TaskDag from '$lib/components/TaskDag.svelte';
import TaskTree from '$lib/components/TaskTree.svelte';
import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import * as Dialog from '$lib/components/ui/dialog/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import * as Table from '$lib/components/ui/table/index.js';
import * as Tabs from '$lib/components/ui/tabs/index.js';
import { Textarea } from '$lib/components/ui/textarea/index.js';
import { wsStore } from '$lib/stores/ws';

let workflow = $state<Workflow | null>(null);
let progress = $state<ProgressResult | null>(null);
let agents = $state<Agent[]>([]);
let messages = $state<Message[]>([]);
let workspaces = $state<Workspace[]>([]);
let dependencies = $state<WorkflowDependencies | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);
let activeTab = $state('tasks');
let viewMode = $state<'table' | 'tree' | 'dag'>('table');
let pollInterval: ReturnType<typeof setInterval>;

// Action state
let actionLoading = $state<string | null>(null);
let actionError = $state<string | null>(null);
const browserSessionId: string | null = null;

// Valid workflow status transitions
const WORKFLOW_TRANSITIONS: Record<string, string[]> = {
  planning: ['ready', 'abandoned'],
  ready: ['in_progress', 'abandoned'],
  in_progress: ['paused', 'completed', 'failed', 'abandoned'],
  paused: ['in_progress', 'abandoned'],
  failed: ['in_progress'],
};

const validTransitions = $derived(workflow ? (WORKFLOW_TRANSITIONS[workflow.status] ?? []) : []);
const isLocked = $derived(!!workflow?.locked_by_session_id);

// Add Task dialog
let showAddTask = $state(false);
let addTaskName = $state('');
let addTaskDescription = $state('');
let addTaskParallelGroup = $state('');
let addTaskComplexity = $state('');
let addTaskDependsOn = $state('');
let addTaskError = $state<string | null>(null);
let addTaskSubmitting = $state(false);

// Delete confirmation
let deleteTask = $state<Task | null>(null);
let deleteError = $state<string | null>(null);
let deleteSubmitting = $state(false);

// Message composer
let showComposer = $state(false);

const REMOVABLE_STATUSES = new Set(['pending', 'blocked', 'planning']);
const workflowId = $derived($page.params.id ?? '');

$effect(() => {
  localStorage.setItem('workflow-view-mode', viewMode);
});

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
    select.value = '';
  }
}

async function loadData() {
  try {
    const [workflowResult, progressResult, agentsResult, messagesResult, workspacesResult] =
      await Promise.all([
        api.getWorkflow(workflowId),
        api.getWorkflowProgress(workflowId),
        api.listAgents({ workflow_id: workflowId }),
        api.listMessages({ limit: 20 }),
        api.listWorkspaces(workflowId),
      ]);

    workflow = workflowResult.data;
    progress = progressResult.data;
    agents = agentsResult.data;
    messages = messagesResult.data;
    workspaces = workspacesResult.data;

    if (viewMode === 'tree' || viewMode === 'dag') {
      const dependenciesResult = await api.getWorkflowDependencies(workflowId);
      dependencies = dependenciesResult.data;
    }

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
  const savedViewMode = localStorage.getItem('workflow-view-mode');
  if (savedViewMode === 'tree' || savedViewMode === 'dag' || savedViewMode === 'table') {
    viewMode = savedViewMode;
  }
  loadData();
  pollInterval = setInterval(loadData, 5000);
  wsStore.subscribeChannel(`workflow:${workflowId}`);
});

onDestroy(() => {
  clearInterval(pollInterval);
  wsStore.unsubscribeChannel(`workflow:${workflowId}`);
});

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

$effect(() => {
  if (viewMode === 'tree' || viewMode === 'dag') {
    loadData();
  }
});
</script>

<!-- Add Task Dialog -->
<Dialog.Root bind:open={showAddTask}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Add Task</Dialog.Title>
      <Dialog.Description>Add a new task to this workflow.</Dialog.Description>
    </Dialog.Header>
    {#if addTaskError}
      <div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        {addTaskError}
      </div>
    {/if}
    <form onsubmit={(e) => { e.preventDefault(); handleAddTask(); }} class="space-y-4">
      <div class="space-y-2">
        <Label for="task-name">Name <span class="text-destructive">*</span></Label>
        <Input id="task-name" bind:value={addTaskName} placeholder="Task name" required />
      </div>
      <div class="space-y-2">
        <Label for="task-desc">Description</Label>
        <Textarea id="task-desc" bind:value={addTaskDescription} rows={3} placeholder="Optional description" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label for="task-group">Parallel Group</Label>
          <Input id="task-group" bind:value={addTaskParallelGroup} placeholder="e.g. group-a" />
        </div>
        <div class="space-y-2">
          <Label for="task-complexity">Complexity</Label>
          <select
            id="task-complexity"
            bind:value={addTaskComplexity}
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">-- Select --</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div class="space-y-2">
        <Label for="task-deps">Depends On</Label>
        <Input id="task-deps" bind:value={addTaskDependsOn} placeholder="Comma-separated task names" />
      </div>
      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={() => { showAddTask = false; }}>Cancel</Button>
        <Button type="submit" disabled={addTaskSubmitting}>
          {addTaskSubmitting ? 'Adding...' : 'Add Task'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<Dialog.Root open={!!deleteTask} onOpenChange={(v) => { if (!v) { deleteTask = null; deleteError = null; } }}>
  <Dialog.Content class="max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Delete Task</Dialog.Title>
      <Dialog.Description>
        Are you sure you want to delete <span class="font-medium">{deleteTask?.name}</span>? Dependencies will be rewired automatically.
      </Dialog.Description>
    </Dialog.Header>
    {#if deleteError}
      <div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        {deleteError}
      </div>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => { deleteTask = null; deleteError = null; }}>Cancel</Button>
      <Button variant="destructive" disabled={deleteSubmitting} onclick={handleDeleteTask}>
        {deleteSubmitting ? 'Deleting...' : 'Delete'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Message Composer -->
<MessageComposer
  bind:open={showComposer}
  workflowId={workflowId}
  onSent={() => loadData()}
/>

<div class="p-6 space-y-6">
  {#if loading}
    <div class="space-y-4">
      <Skeleton class="h-8 w-64" />
      <Skeleton class="h-16 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if workflow}
    <!-- Breadcrumb -->
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <Breadcrumb.Item>
          <Breadcrumb.Link href="/">Workflows</Breadcrumb.Link>
        </Breadcrumb.Item>
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          <Breadcrumb.Page>{workflow.name}</Breadcrumb.Page>
        </Breadcrumb.Item>
      </Breadcrumb.List>
    </Breadcrumb.Root>

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">{workflow.name}</h2>
        {#if workflow.plan_summary}
          <p class="mt-1 text-sm text-muted-foreground">{workflow.plan_summary}</p>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        {#if validTransitions.length > 0}
          <select
            class="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            disabled={actionLoading === 'status'}
            onchange={handleStatusChange}
          >
            <option value="">Change status...</option>
            {#each validTransitions as status}
              <option value={status}>{status.replace(/_/g, ' ')}</option>
            {/each}
          </select>
        {/if}
        <Button
          variant="outline"
          size="sm"
          disabled={actionLoading === 'lock' || !browserSessionId}
          onclick={handleLockToggle}
          title={browserSessionId ? undefined : 'Lock requires session registration'}
        >
          {#if isLocked}
            <UnlockIcon class="mr-1 size-4" />
            Unlock
          {:else}
            <LockIcon class="mr-1 size-4" />
            Lock
          {/if}
        </Button>
      </div>
    </div>

    {#if actionError}
      <div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        {actionError}
      </div>
    {/if}

    <!-- Execution Panel -->
    <ExecutionPanel
      {workflow}
      {progress}
      agentCount={agents.length}
      onRefresh={loadData}
    />

    <!-- Tabs -->
    <Tabs.Root bind:value={activeTab}>
      <Tabs.List>
        <Tabs.Trigger value="tasks">
          <ListIcon class="mr-1.5 size-4" />
          Tasks
          {#if progress}
            <span class="ml-1 text-xs text-muted-foreground">({progress.total_tasks})</span>
          {/if}
        </Tabs.Trigger>
        <Tabs.Trigger value="agents">
          <BotIcon class="mr-1.5 size-4" />
          Agents
          <span class="ml-1 text-xs text-muted-foreground">({agents.length})</span>
        </Tabs.Trigger>
        <Tabs.Trigger value="messages">
          <MailIcon class="mr-1.5 size-4" />
          Messages
          <span class="ml-1 text-xs text-muted-foreground">({messages.length})</span>
        </Tabs.Trigger>
        <Tabs.Trigger value="workspaces">
          <FolderIcon class="mr-1.5 size-4" />
          Workspaces
          <span class="ml-1 text-xs text-muted-foreground">({workspaces.length})</span>
        </Tabs.Trigger>
      </Tabs.List>

      <!-- Tasks Tab -->
      <Tabs.Content value="tasks">
        <div class="mb-3 flex items-center justify-between">
          <div class="inline-flex rounded-lg border border-border p-1">
            {#each ['table', 'tree', 'dag'] as mode}
              <button
                type="button"
                onclick={() => viewMode = mode as typeof viewMode}
                class="rounded px-3 py-1.5 text-sm font-medium transition-colors
                  {viewMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            {/each}
          </div>
          <Button size="sm" onclick={openAddTask}>
            <PlusIcon class="mr-1 size-4" />
            Add Task
          </Button>
        </div>

        {#if viewMode === 'table'}
          {#if workflow.tasks.length === 0}
            <EmptyState icon={ListIcon} title="No tasks" description="Add tasks to this workflow to get started." />
          {:else}
            <Card.Root>
              <Card.Content class="p-0">
                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head class="w-12">#</Table.Head>
                      <Table.Head>Name</Table.Head>
                      <Table.Head>Status</Table.Head>
                      <Table.Head>Agent</Table.Head>
                      <Table.Head>Group</Table.Head>
                      <Table.Head>Updated</Table.Head>
                      <Table.Head class="w-10"></Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {#each workflow.tasks as task}
                      <Table.Row>
                        <Table.Cell class="tabular-nums text-muted-foreground">{task.sequence}</Table.Cell>
                        <Table.Cell>
                          <a
                            href="/workflows/{workflowId}/tasks/{task.id}"
                            class="font-medium text-primary hover:underline"
                          >
                            {task.name}
                          </a>
                          {#if task.description}
                            <p class="mt-0.5 truncate text-xs text-muted-foreground" title={task.description}>
                              {task.description}
                            </p>
                          {/if}
                        </Table.Cell>
                        <Table.Cell><StatusBadge status={task.status} /></Table.Cell>
                        <Table.Cell class="font-mono text-xs text-muted-foreground">
                          {task.assigned_agent_id ?? '—'}
                        </Table.Cell>
                        <Table.Cell class="text-xs text-muted-foreground">
                          {task.parallel_group ?? '—'}
                        </Table.Cell>
                        <Table.Cell class="text-muted-foreground">
                          <RelativeTime timestamp={task.updated_at} />
                        </Table.Cell>
                        <Table.Cell>
                          {#if REMOVABLE_STATUSES.has(task.status) && !task.assigned_agent_id}
                            <button
                              type="button"
                              onclick={() => { deleteTask = task; deleteError = null; deleteSubmitting = false; }}
                              class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Delete task"
                            >
                              <Trash2Icon class="size-4" />
                            </button>
                          {/if}
                        </Table.Cell>
                      </Table.Row>
                    {/each}
                  </Table.Body>
                </Table.Root>
              </Card.Content>
            </Card.Root>
          {/if}
        {:else if viewMode === 'tree'}
          {#if dependencies}
            <TaskTree tasks={workflow.tasks} dependencies={dependencies.dependencies} {workflowId} />
          {:else}
            <div class="flex items-center justify-center rounded-lg border border-border py-12">
              <span class="text-muted-foreground">Loading dependencies...</span>
            </div>
          {/if}
        {:else if viewMode === 'dag'}
          {#if dependencies}
            <TaskDag tasks={workflow.tasks} dependencies={dependencies.dependencies} {workflowId} />
          {:else}
            <div class="flex items-center justify-center rounded-lg border border-border py-12">
              <span class="text-muted-foreground">Loading dependencies...</span>
            </div>
          {/if}
        {/if}
      </Tabs.Content>

      <!-- Agents Tab -->
      <Tabs.Content value="agents">
        {#if agents.length === 0}
          <EmptyState icon={BotIcon} title="No agents" description="No agents registered for this workflow." />
        {:else}
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {#each agents as agent}
              <Card.Root class="transition-colors hover:border-primary/50">
                <a href="/agents/{agent.id}" class="block">
                  <Card.Header class="pb-2">
                    <div class="flex items-center justify-between">
                      <Card.Title class="text-sm">{agent.name}</Card.Title>
                      <StatusBadge status={agent.status} />
                    </div>
                  </Card.Header>
                  <Card.Content class="space-y-1 text-xs text-muted-foreground">
                    <p>Runtime: {agent.runtime}</p>
                    <p>Role: {agent.role}</p>
                    {#if agent.current_task_id}
                      <p>Task: <span class="font-mono">{agent.current_task_id}</span></p>
                    {/if}
                    <p>Heartbeat: <RelativeTime timestamp={agent.last_heartbeat} /></p>
                  </Card.Content>
                </a>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </Tabs.Content>

      <!-- Messages Tab -->
      <Tabs.Content value="messages">
        <div class="mb-3 flex justify-end">
          <Button size="sm" variant="outline" onclick={() => { showComposer = true; }}>
            <SendIcon class="mr-1 size-4" />
            Send Message
          </Button>
        </div>
        {#if messages.length === 0}
          <EmptyState icon={MailIcon} title="No messages" description="No messages in this workflow." />
        {:else}
          <div class="space-y-2">
            {#each messages as msg}
              <Card.Root>
                <Card.Content class="p-3">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                        {msg.message_type}
                      </span>
                      {#if msg.subject}
                        <span class="text-sm font-medium">{msg.subject}</span>
                      {/if}
                    </div>
                    <span class="text-xs text-muted-foreground">
                      <RelativeTime timestamp={msg.created_at} />
                    </span>
                  </div>
                  <p class="mt-1 text-sm text-foreground/80">{msg.body}</p>
                  <div class="mt-1 flex gap-2 text-xs text-muted-foreground">
                    <span>From: {msg.sender_id ?? 'system'}</span>
                    <span>To: {msg.recipient_id}</span>
                    <StatusBadge status={msg.status} />
                  </div>
                </Card.Content>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </Tabs.Content>

      <!-- Workspaces Tab -->
      <Tabs.Content value="workspaces">
        {#if workspaces.length === 0}
          <EmptyState icon={FolderIcon} title="No workspaces" description="No workspaces created for this workflow." />
        {:else}
          <Card.Root>
            <Card.Content class="p-0">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Path</Table.Head>
                    <Table.Head>Branch</Table.Head>
                    <Table.Head>Status</Table.Head>
                    <Table.Head>Created</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each workspaces as ws}
                    <Table.Row>
                      <Table.Cell class="font-mono text-xs">{ws.path}</Table.Cell>
                      <Table.Cell class="text-xs">{ws.branch}</Table.Cell>
                      <Table.Cell><StatusBadge status={ws.status} /></Table.Cell>
                      <Table.Cell class="text-muted-foreground">
                        <RelativeTime timestamp={ws.created_at} />
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </Card.Content>
          </Card.Root>
        {/if}
      </Tabs.Content>
    </Tabs.Root>

    <!-- Metadata -->
    <Separator />
    <div class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
      <div>
        <span class="text-muted-foreground">Source</span>
        <p class="font-medium">{workflow.source_type}</p>
      </div>
      <div>
        <span class="text-muted-foreground">Created</span>
        <p class="font-medium"><RelativeTime timestamp={workflow.created_at} /></p>
      </div>
      <div>
        <span class="text-muted-foreground">Updated</span>
        <p class="font-medium"><RelativeTime timestamp={workflow.updated_at} /></p>
      </div>
      <div>
        <span class="text-muted-foreground">ID</span>
        <p class="font-mono text-xs">{workflow.id}</p>
      </div>
    </div>
  {/if}
</div>
