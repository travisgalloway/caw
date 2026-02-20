<script lang="ts">
import { Activity, Bot, CheckCircle, Mail } from 'lucide-svelte';
import { onDestroy, onMount } from 'svelte';
import { api, type StatsSummary } from '$lib/api/client';
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

// Reload stats on relevant WebSocket events
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

const statCards = $derived([
  {
    label: 'Active Workflows',
    value: stats.active_workflows,
    icon: Activity,
    color: 'blue',
  },
  {
    label: 'Online Agents',
    value: stats.online_agents,
    icon: Bot,
    color: 'green',
  },
  {
    label: 'Unread Messages',
    value: stats.unread_messages,
    icon: Mail,
    color: 'purple',
  },
  {
    label: 'Completed Today',
    value: stats.completed_today,
    icon: CheckCircle,
    color: 'emerald',
  },
]);
</script>

{#if loading}
  <div class="flex items-center justify-center py-8">
    <span class="text-gray-400">Loading stats...</span>
  </div>
{:else if error}
  <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
    {error}
  </div>
{:else}
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each statCards as card}
      {#snippet iconContent()}
        {@const Icon = card.icon}
        <Icon size={24} />
      {/snippet}

      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
            <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{card.value}</p>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-full
              {card.color === 'blue' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' : ''}
              {card.color === 'green' ? 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400' : ''}
              {card.color === 'purple' ? 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400' : ''}
              {card.color === 'emerald' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : ''}"
          >
            {@render iconContent()}
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
