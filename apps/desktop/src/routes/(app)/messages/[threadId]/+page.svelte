<script lang="ts">
import MailIcon from '@lucide/svelte/icons/mail';
import { onMount } from 'svelte';
import { page } from '$app/stores';
import { api, type Message } from '$lib/api/client';
import EmptyState from '$lib/components/EmptyState.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';

let messages = $state<Message[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);

const threadId = $derived($page.params.threadId ?? '');

onMount(async () => {
  try {
    const result = await api.getThread(threadId);
    messages = result.data;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
});
</script>

<div class="p-6 space-y-6">
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Link href="/messages">Messages</Breadcrumb.Link>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>Thread</Breadcrumb.Page>
      </Breadcrumb.Item>
    </Breadcrumb.List>
  </Breadcrumb.Root>

  <h2 class="text-2xl font-bold tracking-tight">Thread</h2>

  {#if loading}
    <div class="space-y-2">
      {#each Array(3) as _}
        <Skeleton class="h-20 w-full" />
      {/each}
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if messages.length === 0}
    <EmptyState icon={MailIcon} title="No messages in thread" description="This thread is empty." />
  {:else}
    <div class="space-y-3">
      {#each messages as msg}
        <Card.Root>
          <Card.Content class="p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Badge variant="secondary">{msg.message_type}</Badge>
                <Badge variant="outline">{msg.priority}</Badge>
                {#if msg.subject}
                  <span class="text-sm font-medium">{msg.subject}</span>
                {/if}
              </div>
              <span class="text-xs text-muted-foreground">
                <RelativeTime timestamp={msg.created_at} />
              </span>
            </div>
            <p class="mt-2 text-sm">{msg.body}</p>
            <div class="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span>From: {msg.sender_id ?? 'system'}</span>
              <span>To: {msg.recipient_id}</span>
              <StatusBadge status={msg.status} />
            </div>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>
