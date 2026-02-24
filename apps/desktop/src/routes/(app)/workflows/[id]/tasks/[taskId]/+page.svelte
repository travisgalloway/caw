<script lang="ts">
import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
import ClockIcon from '@lucide/svelte/icons/clock';
import { onDestroy, onMount } from 'svelte';
import { page } from '$app/stores';
import { type Agent, api, type Task } from '$lib/api/client';
import EmptyState from '$lib/components/EmptyState.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import { Textarea } from '$lib/components/ui/textarea/index.js';
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

const workflowId = $derived($page.params.id ?? '');
const taskId = $derived($page.params.taskId ?? '');

const TASK_TRANSITIONS: Record<string, string[]> = {
  pending: ['planning'],
  blocked: ['planning'],
  planning: ['in_progress', 'completed'],
  in_progress: ['completed', 'paused', 'failed'],
  paused: ['in_progress'],
  failed: ['pending', 'skipped'],
};

const validNextStates = $derived(task ? (TASK_TRANSITIONS[task.status] ?? []) : []);

async function loadData() {
  try {
    const [taskRes, depsRes, agentsRes] = await Promise.all([
      api.getTask(taskId, true),
      api.getTaskDependencies(taskId),
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

$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type?.startsWith('task:') || event?.type?.startsWith('workflow:')) {
    loadData();
  }
});
</script>

<div class="p-6 space-y-6">
  {#if loading}
    <div class="space-y-4">
      <Skeleton class="h-6 w-64" />
      <Skeleton class="h-8 w-96" />
      <Skeleton class="h-32 w-full" />
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if task}
    <!-- Breadcrumb -->
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <Breadcrumb.Item>
          <Breadcrumb.Link href="/">Workflows</Breadcrumb.Link>
        </Breadcrumb.Item>
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          <Breadcrumb.Link href="/workflows/{workflowId}">{workflowId}</Breadcrumb.Link>
        </Breadcrumb.Item>
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          <Breadcrumb.Page>{task.name}</Breadcrumb.Page>
        </Breadcrumb.Item>
      </Breadcrumb.List>
    </Breadcrumb.Root>

    <!-- Header -->
    <div>
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold tracking-tight">{task.name}</h2>
        <StatusBadge status={task.status} />
      </div>
      {#if task.description}
        <p class="mt-1 text-sm text-muted-foreground">{task.description}</p>
      {/if}
    </div>

    <!-- Metadata Grid -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Sequence</p>
          <p class="mt-1 text-lg font-semibold">{task.sequence}</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Parallel Group</p>
          <p class="mt-1 text-lg font-semibold">{task.parallel_group ?? '—'}</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Assigned Agent</p>
          <p class="mt-1 font-mono text-sm">{task.assigned_agent_id ?? '—'}</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Updated</p>
          <p class="mt-1 text-sm"><RelativeTime timestamp={task.updated_at} /></p>
        </Card.Content>
      </Card.Root>
    </div>

    <!-- Status Transitions -->
    {#if validNextStates.length > 0}
      <Card.Root>
        <Card.Content class="p-4">
          <h3 class="mb-3 text-sm font-semibold text-muted-foreground">Change Status</h3>
          {#if statusActionError}
            <div class="mb-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {statusActionError}
            </div>
          {/if}
          <div class="flex flex-wrap gap-2">
            {#each validNextStates as nextStatus}
              <Button
                variant={statusAction === nextStatus ? 'default' : 'outline'}
                size="sm"
                onclick={() => {
                  statusAction = nextStatus;
                  statusActionError = null;
                  statusOutcome = '';
                  statusError = '';
                }}
              >
                {nextStatus.replace(/_/g, ' ')}
              </Button>
            {/each}
          </div>
          {#if statusAction === 'completed'}
            <div class="mt-3 space-y-2">
              <label for="outcome" class="text-sm font-medium">Outcome</label>
              <Textarea
                id="outcome"
                bind:value={statusOutcome}
                rows={3}
                placeholder="Describe the outcome..."
              />
            </div>
          {/if}
          {#if statusAction === 'failed'}
            <div class="mt-3 space-y-2">
              <label for="error-detail" class="text-sm font-medium">Error Detail</label>
              <Textarea
                id="error-detail"
                bind:value={statusError}
                rows={3}
                placeholder="Describe what went wrong..."
              />
            </div>
          {/if}
          {#if statusAction}
            <div class="mt-3 flex gap-2">
              <Button size="sm" disabled={statusSubmitting} onclick={handleStatusChange}>
                {statusSubmitting ? 'Updating...' : `Set ${statusAction}`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onclick={() => { statusAction = null; statusActionError = null; }}
              >
                Cancel
              </Button>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Agent Assignment -->
    <Card.Root>
      <Card.Content class="p-4">
        <h3 class="mb-3 text-sm font-semibold text-muted-foreground">Agent Assignment</h3>
        {#if claimError}
          <div class="mb-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {claimError}
          </div>
        {/if}
        {#if task.assigned_agent_id}
          <div class="flex items-center gap-3">
            <span class="text-sm">
              Assigned to: <a href="/agents/{task.assigned_agent_id}" class="font-mono font-medium text-primary hover:underline">{task.assigned_agent_id}</a>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={claimSubmitting}
              onclick={handleRelease}
            >
              {claimSubmitting ? 'Releasing...' : 'Release'}
            </Button>
          </div>
        {:else}
          <div class="flex items-center gap-2">
            {#if agents.length > 0}
              <select
                bind:value={claimAgentId}
                class="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select agent...</option>
                {#each agents as agent}
                  <option value={agent.id}>{agent.name} ({agent.id})</option>
                {/each}
              </select>
            {:else}
              <Input bind:value={claimAgentId} placeholder="Agent ID" class="w-48" />
            {/if}
            <Button
              size="sm"
              disabled={claimSubmitting || !claimAgentId.trim()}
              onclick={handleClaim}
            >
              {claimSubmitting ? 'Claiming...' : 'Claim'}
            </Button>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Plan -->
    {#if task.plan}
      <Card.Root>
        <Card.Content class="p-4">
          <h3 class="mb-2 text-sm font-semibold text-muted-foreground">Plan</h3>
          <pre class="whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm">{task.plan}</pre>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Outcome -->
    {#if task.outcome}
      <Card.Root class="border-status-completed/30">
        <Card.Content class="p-4">
          <h3 class="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CheckCircleIcon class="size-4 text-status-completed" />
            Outcome
          </h3>
          <pre class="whitespace-pre-wrap rounded-lg bg-status-completed/10 p-4 text-sm">{task.outcome}</pre>
        </Card.Content>
      </Card.Root>
    {/if}

    {#if task.outcome_detail}
      <Card.Root class="border-destructive/30">
        <Card.Content class="p-4">
          <h3 class="mb-2 text-sm font-semibold text-destructive">Error Detail</h3>
          <pre class="whitespace-pre-wrap rounded-lg bg-destructive/10 p-4 text-sm">{task.outcome_detail}</pre>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Dependencies -->
    {#if deps}
      <Card.Root>
        <Card.Content class="p-4">
          <h3 class="mb-3 text-sm font-semibold text-muted-foreground">Dependencies</h3>
          {#if deps.dependencies.length === 0 && deps.dependents.length === 0}
            <p class="text-sm text-muted-foreground">No dependencies.</p>
          {:else}
            <div class="grid gap-4 sm:grid-cols-2">
              {#if deps.dependencies.length > 0}
                <div>
                  <p class="mb-1 text-xs font-medium text-muted-foreground">
                    Depends on ({deps.dependencies.length})
                  </p>
                  <ul class="space-y-1">
                    {#each deps.dependencies as dep}
                      <li>
                        <a
                          href="/workflows/{workflowId}/tasks/{dep.depends_on_id}"
                          class="font-mono text-xs text-primary hover:underline"
                        >
                          {dep.depends_on_id}
                        </a>
                        <Badge variant="outline" class="ml-1 text-[10px]">{dep.dependency_type}</Badge>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if deps.dependents.length > 0}
                <div>
                  <p class="mb-1 text-xs font-medium text-muted-foreground">
                    Blocks ({deps.dependents.length})
                  </p>
                  <ul class="space-y-1">
                    {#each deps.dependents as dep}
                      <li>
                        <a
                          href="/workflows/{workflowId}/tasks/{dep.task_id}"
                          class="font-mono text-xs text-primary hover:underline"
                        >
                          {dep.task_id}
                        </a>
                        <Badge variant="outline" class="ml-1 text-[10px]">{dep.dependency_type}</Badge>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Checkpoints -->
    {#if task.checkpoints && task.checkpoints.length > 0}
      <Card.Root>
        <Card.Content class="p-4">
          <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ClockIcon class="size-4" />
            Checkpoints ({task.checkpoints.length})
          </h3>
          <div class="space-y-2">
            {#each task.checkpoints as cp}
              <div class="rounded-lg border border-border p-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary">#{cp.sequence}</Badge>
                    <Badge variant="outline">{cp.checkpoint_type}</Badge>
                  </div>
                  <span class="text-xs text-muted-foreground">
                    <RelativeTime timestamp={cp.created_at} />
                  </span>
                </div>
                <p class="mt-1 text-sm">{cp.summary}</p>
              </div>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {/if}
  {/if}
</div>
