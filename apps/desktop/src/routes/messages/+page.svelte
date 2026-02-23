<script lang="ts">
import CheckIcon from '@lucide/svelte/icons/check';
import MailIcon from '@lucide/svelte/icons/mail';
import SendIcon from '@lucide/svelte/icons/send';
import { onDestroy, onMount } from 'svelte';
import { api, type Message } from '$lib/api/client';
import EmptyState from '$lib/components/EmptyState.svelte';
import MessageComposer from '$lib/components/MessageComposer.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import { wsStore } from '$lib/stores/ws';

let messages = $state<Message[]>([]);
let unreadCount = $state(0);
let loading = $state(true);
let error = $state<string | null>(null);
let filter = $state<'all' | 'unread'>('all');
let priorityFilter = $state('');
let showComposer = $state(false);
let pollInterval: ReturnType<typeof setInterval>;

const displayMessages = $derived.by(() => {
  let result = messages;
  if (filter === 'unread') result = result.filter((m) => m.status === 'unread');
  if (priorityFilter) result = result.filter((m) => m.priority === priorityFilter);
  return result;
});

async function loadMessages() {
  try {
    const [msgRes, unreadRes] = await Promise.all([
      api.listMessages({ limit: 100 }),
      api.getUnreadCount(),
    ]);
    messages = msgRes.data;
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

<MessageComposer bind:open={showComposer} onSent={() => loadMessages()} />

<div class="p-6 space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Messages</h2>
      <p class="text-sm text-muted-foreground">{unreadCount} unread</p>
    </div>
    <div class="flex items-center gap-2">
      <select
        value={priorityFilter}
        onchange={(e) => { priorityFilter = (e.target as HTMLSelectElement).value; }}
        class="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">All priorities</option>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <Button
        variant={filter === 'unread' ? 'default' : 'outline'}
        size="sm"
        onclick={() => { filter = filter === 'all' ? 'unread' : 'all'; }}
      >
        {filter === 'all' ? 'Show unread' : 'Show all'}
      </Button>
      {#if unreadCount > 0}
        <Button variant="outline" size="sm" onclick={markAllRead}>
          <CheckIcon class="mr-1 size-4" />
          Mark all read
        </Button>
      {/if}
      <Button size="sm" onclick={() => { showComposer = true; }}>
        <SendIcon class="mr-1 size-4" />
        Compose
      </Button>
    </div>
  </div>

  {#if loading}
    <div class="space-y-2">
      {#each Array(5) as _}
        <Skeleton class="h-20 w-full" />
      {/each}
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if displayMessages.length === 0}
    <EmptyState icon={MailIcon} title="No messages" description="Messages will appear here when agents communicate." />
  {:else}
    <div class="space-y-2">
      {#each displayMessages as msg}
        <Card.Root
          class={msg.status === 'unread' ? 'border-primary/30 bg-primary/5' : ''}
        >
          <Card.Content class="p-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Badge variant="secondary">{msg.message_type}</Badge>
                <Badge
                  variant={msg.priority === 'urgent' ? 'destructive' : msg.priority === 'high' ? 'default' : 'outline'}
                >
                  {msg.priority}
                </Badge>
                {#if msg.subject}
                  <span class="text-sm font-medium">{msg.subject}</span>
                {/if}
                {#if msg.status === 'unread'}
                  <span class="size-2 rounded-full bg-primary"></span>
                {/if}
              </div>
              <span class="text-xs text-muted-foreground">
                <RelativeTime timestamp={msg.created_at} />
              </span>
            </div>
            <p class="mt-1 text-sm">{msg.body}</p>
            <div class="mt-1 flex gap-3 text-xs text-muted-foreground">
              <span>From: {msg.sender_id ?? 'system'}</span>
              <span>To: {msg.recipient_id}</span>
              {#if msg.thread_id !== msg.id}
                <a
                  href="/messages/{msg.thread_id}"
                  class="text-primary hover:underline"
                >
                  View thread
                </a>
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>
