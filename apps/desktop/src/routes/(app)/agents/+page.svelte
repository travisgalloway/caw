<script lang="ts">
import BotIcon from '@lucide/svelte/icons/bot';
import XIcon from '@lucide/svelte/icons/x';
import { onDestroy, onMount } from 'svelte';
import { type Agent, api, type WorkflowSummary } from '$lib/api/client';
import EmptyState from '$lib/components/EmptyState.svelte';
import LiveIndicator from '$lib/components/LiveIndicator.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import { wsStore } from '$lib/stores/ws';

let agents = $state<Agent[]>([]);
let workflows = $state<WorkflowSummary[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let pollInterval: ReturnType<typeof setInterval>;

let statusFilter = $state('');
let runtimeFilter = $state('');
let roleFilter = $state('');
let workflowFilter = $state('');

const filteredAgents = $derived.by(() => {
  let result = agents;
  if (statusFilter) result = result.filter((a) => a.status === statusFilter);
  if (runtimeFilter) result = result.filter((a) => a.runtime === runtimeFilter);
  if (roleFilter) result = result.filter((a) => a.role === roleFilter);
  if (workflowFilter) result = result.filter((a) => a.workflow_id === workflowFilter);
  return result;
});

const stats = $derived.by(() => {
  const total = agents.length;
  const online = agents.filter((a) => a.status === 'online').length;
  const busy = agents.filter((a) => a.status === 'busy').length;
  const offline = agents.filter((a) => a.status === 'offline').length;
  return { total, online, busy, offline };
});

const uniqueStatuses = $derived([...new Set(agents.map((a) => a.status))].sort());
const uniqueRuntimes = $derived([...new Set(agents.map((a) => a.runtime))].sort());
const uniqueRoles = $derived([...new Set(agents.map((a) => a.role))].sort());

const hasFilters = $derived(
  statusFilter !== '' || runtimeFilter !== '' || roleFilter !== '' || workflowFilter !== '',
);

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

$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type?.startsWith('agent:')) {
    loadData();
  }
});
</script>

<div class="px-5 py-4 space-y-4">
  <!-- Agent stats and filters below -->

  {#if loading}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {#each Array(4) as _}
        <Card.Root><Card.Content class="p-4"><Skeleton class="h-16 w-full" /></Card.Content></Card.Root>
      {/each}
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else}
    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      {#snippet filterSelect(id: string, label: string, value: string, options: string[], onchange: (v: string) => void)}
        <div class="flex items-center gap-2">
          <label for={id} class="text-sm font-medium text-muted-foreground">{label}:</label>
          <select
            {id}
            {value}
            onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
            class="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All</option>
            {#each options as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </div>
      {/snippet}

      {@render filterSelect('sf', 'Status', statusFilter, uniqueStatuses, (v) => { statusFilter = v; })}
      {@render filterSelect('rf', 'Runtime', runtimeFilter, uniqueRuntimes, (v) => { runtimeFilter = v; })}
      {@render filterSelect('rlf', 'Role', roleFilter, uniqueRoles, (v) => { roleFilter = v; })}

      <div class="flex items-center gap-2">
        <label for="wf" class="text-sm font-medium text-muted-foreground">Workflow:</label>
        <select
          id="wf"
          value={workflowFilter}
          onchange={(e) => { workflowFilter = (e.target as HTMLSelectElement).value; }}
          class="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All</option>
          {#each workflows as wf}
            <option value={wf.id}>{wf.name}</option>
          {/each}
        </select>
      </div>

      {#if hasFilters}
        <Button variant="ghost" size="sm" onclick={resetFilters}>
          <XIcon class="mr-1 size-3" />
          Reset
        </Button>
      {/if}
    </div>

    <!-- Agent Cards -->
    {#if filteredAgents.length === 0}
      <EmptyState
        icon={BotIcon}
        title={agents.length === 0 ? 'No agents registered' : 'No agents match filters'}
        description={agents.length === 0
          ? 'Agents register when workflows are executed.'
          : 'Try adjusting your filters.'}
      />
    {:else}
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {#each filteredAgents as agent}
          <Card.Root class="transition-colors hover:border-primary/50">
            <a href="/agents/{agent.id}" class="block">
              <Card.Header class="pb-2">
                <div class="flex items-center justify-between">
                  <Card.Title class="flex items-center gap-2 text-sm">
                    {#if agent.status === 'online'}
                      <LiveIndicator connected={true} />
                    {/if}
                    {agent.name}
                  </Card.Title>
                  <StatusBadge status={agent.status} />
                </div>
              </Card.Header>
              <Card.Content class="space-y-1 text-xs text-muted-foreground">
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
                <p>Heartbeat: <RelativeTime timestamp={agent.last_heartbeat} /></p>
              </Card.Content>
            </a>
          </Card.Root>
        {/each}
      </div>
    {/if}
  {/if}
</div>
