<script lang="ts">
import ActivityIcon from '@lucide/svelte/icons/activity';
import BotIcon from '@lucide/svelte/icons/bot';
import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
import MailIcon from '@lucide/svelte/icons/mail';
import type { Component } from 'svelte';
import { onDestroy, onMount } from 'svelte';
import { api, type StatsSummary } from '$lib/api/client';
import * as Card from '$lib/components/ui/card/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import { wsStore } from '$lib/stores/ws';

let stats = $state<StatsSummary>({
  active_workflows: 0,
  online_agents: 0,
  unread_messages: 0,
  completed_today: 0,
});
let loading = $state(true);
let error = $state<string | null>(null);
let pollInterval: ReturnType<typeof setInterval>;

async function loadStats() {
  try {
    const result = await api.getStatsSummary();
    stats = result.data;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

onMount(() => {
  loadStats();
  pollInterval = setInterval(loadStats, 5000);
});

onDestroy(() => {
  clearInterval(pollInterval);
});

$effect(() => {
  const event = $wsStore.lastEvent;
  if (
    event?.type &&
    [
      'workflow:status',
      'agent:registered',
      'agent:heartbeat',
      'agent:unregistered',
      'message:new',
    ].includes(event.type)
  ) {
    loadStats();
  }
});

const statCards: { label: string; key: keyof StatsSummary; icon: Component; color: string }[] = [
  {
    label: 'Active Workflows',
    key: 'active_workflows',
    icon: ActivityIcon,
    color: 'text-blue-600 dark:text-blue-400',
  },
  {
    label: 'Online Agents',
    key: 'online_agents',
    icon: BotIcon,
    color: 'text-green-600 dark:text-green-400',
  },
  {
    label: 'Unread Messages',
    key: 'unread_messages',
    icon: MailIcon,
    color: 'text-purple-600 dark:text-purple-400',
  },
  {
    label: 'Completed Today',
    key: 'completed_today',
    icon: CheckCircleIcon,
    color: 'text-emerald-600 dark:text-emerald-400',
  },
];
</script>

{#if loading}
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each Array(4) as _}
      <Card.Root>
        <Card.Content class="p-6">
          <Skeleton class="h-16 w-full" />
        </Card.Content>
      </Card.Root>
    {/each}
  </div>
{:else if error}
  <Card.Root class="border-destructive">
    <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
  </Card.Root>
{:else}
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each statCards as card}
      {@const Icon = card.icon}
      <Card.Root>
        <Card.Content class="p-6">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <p class="text-sm font-medium text-muted-foreground">{card.label}</p>
              <p class="mt-2 text-3xl font-bold">{stats[card.key]}</p>
            </div>
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Icon class="size-6 {card.color}" />
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    {/each}
  </div>
{/if}
