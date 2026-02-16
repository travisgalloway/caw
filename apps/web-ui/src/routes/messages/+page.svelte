<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { api, type Message } from '$lib/api/client';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { wsStore } from '$lib/stores/ws';

let messages = $state<Message[]>([]);
let unreadCount = $state(0);
let loading = $state(true);
let error = $state<string | null>(null);
let filter = $state<'all' | 'unread'>('all');
let pollInterval: ReturnType<typeof setInterval>;

async function loadMessages() {
  try {
    const [msgRes, unreadRes] = await Promise.all([
      api.listMessages({ limit: 100 }),
      api.getUnreadCount(),
    ]);
    messages = filter === 'unread' ? msgRes.data.filter((m) => m.status === 'unread') : msgRes.data;
    unreadCount = unreadRes.data.count;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

async function markAllRead() {
  const unread = messages.filter((m) => m.status === 'unread').map((m) => m.id);
  if (unread.length > 0) {
    await api.markRead(unread);
    await loadMessages();
  }
}

onMount(() => {
  loadMessages();
  pollInterval = setInterval(loadMessages, 5000);
});

onDestroy(() => {
  clearInterval(pollInterval);
});

$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type === 'message:new') {
    loadMessages();
  }
});
</script>

<div class="p-6">
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold">Messages</h2>
      <p class="text-sm text-gray-500">{unreadCount} unread</p>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="rounded-md px-3 py-1.5 text-sm {filter === 'unread' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
        onclick={() => { filter = filter === 'all' ? 'unread' : 'all'; loadMessages(); }}
      >
        {filter === 'all' ? 'Show unread' : 'Show all'}
      </button>
      {#if unreadCount > 0}
        <button
          class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          onclick={markAllRead}
        >
          Mark all read
        </button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <span class="text-gray-400">Loading...</span>
    </div>
  {:else if error}
    <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  {:else if messages.length === 0}
    <p class="py-12 text-center text-gray-400">No messages.</p>
  {:else}
    <div class="space-y-2">
      {#each messages as msg}
        <div
          class="rounded-lg border p-3 transition-colors
            {msg.status === 'unread'
              ? 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30'
              : 'border-gray-200 dark:border-gray-800'}"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium dark:bg-gray-800">
                {msg.message_type}
              </span>
              <StatusBadge status={msg.priority} />
              {#if msg.subject}
                <span class="text-sm font-medium">{msg.subject}</span>
              {/if}
            </div>
            <span class="text-xs text-gray-400"><RelativeTime timestamp={msg.created_at} /></span>
          </div>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{msg.body}</p>
          <div class="mt-1 flex gap-3 text-xs text-gray-400">
            <span>From: {msg.sender_id ?? 'system'}</span>
            <span>To: {msg.recipient_id}</span>
            <StatusBadge status={msg.status} />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
