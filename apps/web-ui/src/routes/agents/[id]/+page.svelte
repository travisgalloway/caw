<script lang="ts">
import { onMount } from 'svelte';
import { page } from '$app/stores';
import { type Agent, api, type Message } from '$lib/api/client';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';

let agent = $state<Agent | null>(null);
let messages = $state<Message[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);

const agentId = $derived($page.params.id ?? '');

onMount(async () => {
  try {
    const [agentRes, msgRes] = await Promise.all([
      api.getAgent(agentId),
      api.listAgentMessages(agentId),
    ]);
    agent = agentRes.data;
    messages = msgRes.data;
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
  {:else if agent}
    <div class="mb-1">
      <a href="/" class="text-sm text-gray-400 hover:text-gray-600">&larr; Back</a>
    </div>

    <div class="mb-6 flex items-center gap-3">
      <h2 class="text-2xl font-bold">{agent.name}</h2>
      <StatusBadge status={agent.status} />
    </div>

    <!-- Info grid -->
    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p class="text-xs font-medium text-gray-400">Runtime</p>
        <p class="mt-1 font-semibold">{agent.runtime}</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p class="text-xs font-medium text-gray-400">Role</p>
        <p class="mt-1 font-semibold">{agent.role}</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p class="text-xs font-medium text-gray-400">Current Task</p>
        <p class="mt-1 font-mono text-sm">{agent.current_task_id ?? '—'}</p>
      </div>
      <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p class="text-xs font-medium text-gray-400">Last Heartbeat</p>
        <p class="mt-1 text-sm"><RelativeTime timestamp={agent.last_heartbeat} /></p>
      </div>
    </div>

    {#if agent.capabilities}
      <div class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-gray-600">Capabilities</h3>
        <div class="flex flex-wrap gap-1">
          {#each JSON.parse(agent.capabilities) as cap}
            <span class="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">{cap}</span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Messages -->
    <div>
      <h3 class="mb-2 text-sm font-semibold text-gray-600">Messages ({messages.length})</h3>
      {#if messages.length === 0}
        <p class="text-sm text-gray-400">No messages for this agent.</p>
      {:else}
        <div class="space-y-2">
          {#each messages as msg}
            <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium dark:bg-gray-800">
                    {msg.message_type}
                  </span>
                  <StatusBadge status={msg.status} />
                </div>
                <span class="text-xs text-gray-400"><RelativeTime timestamp={msg.created_at} /></span>
              </div>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{msg.body}</p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
