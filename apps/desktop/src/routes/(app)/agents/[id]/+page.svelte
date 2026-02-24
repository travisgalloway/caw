<script lang="ts">
import HeartPulseIcon from '@lucide/svelte/icons/heart-pulse';
import MailIcon from '@lucide/svelte/icons/mail';
import SendIcon from '@lucide/svelte/icons/send';
import Trash2Icon from '@lucide/svelte/icons/trash-2';
import { onDestroy, onMount } from 'svelte';
import { page } from '$app/stores';
import { type Agent, api, type Message } from '$lib/api/client';
import EmptyState from '$lib/components/EmptyState.svelte';
import MessageComposer from '$lib/components/MessageComposer.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import { wsStore } from '$lib/stores/ws';

let agent = $state<Agent | null>(null);
let messages = $state<Message[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let showComposer = $state(false);
let pollInterval: ReturnType<typeof setInterval>;

const agentId = $derived($page.params.id ?? '');

async function loadData() {
  try {
    const [agentRes, msgRes] = await Promise.all([
      api.getAgent(agentId),
      api.listAgentMessages(agentId),
    ]);
    agent = agentRes.data;
    messages = msgRes.data;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

async function handleHeartbeat() {
  try {
    await api.sendHeartbeat(agentId);
    await loadData();
  } catch {
    // ignore
  }
}

async function handleUnregister() {
  if (!confirm('Are you sure you want to unregister this agent?')) return;
  try {
    await api.unregisterAgent(agentId);
    window.location.href = '/agents';
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
}

onMount(() => {
  loadData();
  pollInterval = setInterval(loadData, 5000);
  wsStore.subscribeChannel(`agent:${agentId}`);
});

onDestroy(() => {
  clearInterval(pollInterval);
  wsStore.unsubscribeChannel(`agent:${agentId}`);
});

$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type?.startsWith('agent:') || event?.type === 'message:new') {
    loadData();
  }
});
</script>

<MessageComposer
  bind:open={showComposer}
  recipientId={agentId}
  onSent={() => loadData()}
/>

<div class="p-6 space-y-6">
  {#if loading}
    <div class="space-y-4">
      <Skeleton class="h-6 w-48" />
      <Skeleton class="h-8 w-64" />
      <div class="grid gap-4 sm:grid-cols-4">
        {#each Array(4) as _}
          <Skeleton class="h-20 w-full" />
        {/each}
      </div>
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if agent}
    <!-- Breadcrumb -->
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <Breadcrumb.Item>
          <Breadcrumb.Link href="/agents">Agents</Breadcrumb.Link>
        </Breadcrumb.Item>
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          <Breadcrumb.Page>{agent.name}</Breadcrumb.Page>
        </Breadcrumb.Item>
      </Breadcrumb.List>
    </Breadcrumb.Root>

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold tracking-tight">{agent.name}</h2>
        <StatusBadge status={agent.status} />
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" onclick={handleHeartbeat}>
          <HeartPulseIcon class="mr-1 size-4" />
          Heartbeat
        </Button>
        <Button variant="outline" size="sm" onclick={() => { showComposer = true; }}>
          <SendIcon class="mr-1 size-4" />
          Message
        </Button>
        <Button variant="destructive" size="sm" onclick={handleUnregister}>
          <Trash2Icon class="mr-1 size-4" />
          Unregister
        </Button>
      </div>
    </div>

    <!-- Info Grid -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Runtime</p>
          <p class="mt-1 font-semibold">{agent.runtime}</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Role</p>
          <p class="mt-1 font-semibold">{agent.role}</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Current Task</p>
          <p class="mt-1 font-mono text-sm">{agent.current_task_id ?? '—'}</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Last Heartbeat</p>
          <p class="mt-1 text-sm"><RelativeTime timestamp={agent.last_heartbeat} /></p>
        </Card.Content>
      </Card.Root>
    </div>

    {#if agent.workflow_id}
      <div class="text-sm">
        <span class="text-muted-foreground">Workflow:</span>
        <a href="/workflows/{agent.workflow_id}" class="ml-1 font-mono text-primary hover:underline">
          {agent.workflow_id}
        </a>
      </div>
    {/if}

    <!-- Capabilities -->
    {#if agent.capabilities}
      <Card.Root>
        <Card.Content class="p-4">
          <h3 class="mb-2 text-sm font-semibold text-muted-foreground">Capabilities</h3>
          <div class="flex flex-wrap gap-1">
            {#each JSON.parse(agent.capabilities) as cap}
              <Badge variant="secondary">{cap}</Badge>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <Separator />

    <!-- Messages -->
    <div>
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-muted-foreground">Messages ({messages.length})</h3>
        <Button variant="outline" size="sm" onclick={() => { showComposer = true; }}>
          <SendIcon class="mr-1 size-4" />
          Send
        </Button>
      </div>
      {#if messages.length === 0}
        <EmptyState icon={MailIcon} title="No messages" description="No messages for this agent." />
      {:else}
        <div class="space-y-2">
          {#each messages as msg}
            <Card.Root>
              <Card.Content class="p-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary">{msg.message_type}</Badge>
                    <StatusBadge status={msg.status} />
                  </div>
                  <span class="text-xs text-muted-foreground">
                    <RelativeTime timestamp={msg.created_at} />
                  </span>
                </div>
                <p class="mt-1 text-sm">{msg.body}</p>
              </Card.Content>
            </Card.Root>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
