<script lang="ts">
import ListIcon from '@lucide/svelte/icons/list';
import PlusIcon from '@lucide/svelte/icons/plus';
import { onDestroy, onMount } from 'svelte';
import { api, type WorkflowSummary } from '$lib/api/client';
import EmptyState from '$lib/components/EmptyState.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatsCards from '$lib/components/StatsCards.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import * as Table from '$lib/components/ui/table/index.js';
import WorkflowCreateForm from '$lib/components/WorkflowCreateForm.svelte';
import { commandStore } from '$lib/stores/command';
import { wsStore } from '$lib/stores/ws';

let workflows = $state<WorkflowSummary[]>([]);
let total = $state(0);
let loading = $state(true);
let error = $state<string | null>(null);
let showAll = $state(false);
let showCreateDialog = $state(false);
let searchQuery = $state('');
let pollInterval: ReturnType<typeof setInterval>;

const activeStatuses = 'planning,ready,in_progress,paused,awaiting_merge';

const filteredWorkflows = $derived(
  searchQuery
    ? workflows.filter(
        (w) =>
          w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          w.id.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : workflows,
);

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

  // Register command palette actions
  commandStore.registerActions([
    {
      id: 'workflow-create',
      label: 'Create Workflow',
      group: 'Actions',
      onSelect: () => {
        showCreateDialog = true;
      },
    },
    {
      id: 'workflow-refresh',
      label: 'Refresh Workflows',
      group: 'Actions',
      onSelect: () => loadWorkflows(),
    },
  ]);
});

onDestroy(() => {
  clearInterval(pollInterval);
  commandStore.unregisterActions(['workflow-create', 'workflow-refresh']);
});

$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type === 'workflow:status') {
    loadWorkflows();
  }
});
</script>

<div class="p-6 space-y-6">
  <StatsCards />

  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Workflows</h2>
      <p class="text-sm text-muted-foreground">{total} workflow{total !== 1 ? 's' : ''}</p>
    </div>
    <div class="flex items-center gap-2">
      <input
        type="text"
        placeholder="Search..."
        bind:value={searchQuery}
        class="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <Button variant="outline" size="sm" onclick={() => { showAll = !showAll; loadWorkflows(); }}>
        {showAll ? 'All' : 'Active'}
      </Button>
      <Button size="sm" onclick={() => { showCreateDialog = true; }}>
        <PlusIcon class="mr-1 size-4" />
        New Workflow
      </Button>
    </div>
  </div>

  {#if loading}
    <Card.Root>
      <Card.Content class="p-0">
        <div class="space-y-0">
          {#each Array(5) as _}
            <div class="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
              <Skeleton class="h-4 w-48" />
              <Skeleton class="h-5 w-20 rounded-full" />
              <Skeleton class="h-4 w-16" />
              <Skeleton class="h-4 w-12" />
            </div>
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if filteredWorkflows.length === 0}
    <EmptyState
      icon={ListIcon}
      title="No workflows found"
      description={searchQuery
        ? 'Try a different search term.'
        : 'Create a workflow via MCP, the CLI, or the button above.'}
    />
  {:else}
    <Card.Root>
      <Card.Content class="p-0">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Source</Table.Head>
              <Table.Head>Updated</Table.Head>
              <Table.Head class="text-right">ID</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each filteredWorkflows as wf}
              <Table.Row class="cursor-pointer">
                <Table.Cell>
                  <a
                    href="/workflows/{wf.id}"
                    class="font-medium text-primary hover:underline"
                  >
                    {wf.name}
                  </a>
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge status={wf.status} />
                </Table.Cell>
                <Table.Cell class="text-muted-foreground">{wf.source_type}</Table.Cell>
                <Table.Cell class="text-muted-foreground">
                  <RelativeTime timestamp={wf.updated_at} />
                </Table.Cell>
                <Table.Cell class="text-right font-mono text-xs text-muted-foreground">
                  {wf.id}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  {/if}
</div>

<WorkflowCreateForm
  open={showCreateDialog}
  onclose={() => { showCreateDialog = false; }}
  oncreate={() => {
    showCreateDialog = false;
    loadWorkflows();
  }}
/>
