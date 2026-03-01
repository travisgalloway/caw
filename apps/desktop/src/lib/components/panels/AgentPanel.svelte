<script lang="ts">
import HeartPulseIcon from '@lucide/svelte/icons/heart-pulse';
import SendIcon from '@lucide/svelte/icons/send';
import Trash2Icon from '@lucide/svelte/icons/trash-2';
import type { Agent } from '$lib/api/client';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';

interface Props {
  agent: Agent;
  onHeartbeat: () => void;
  onMessage: () => void;
  onUnregister: () => void;
}

const { agent, onHeartbeat, onMessage, onUnregister }: Props = $props();

const capabilities = $derived.by(() => {
  try {
    if (agent.capabilities) {
      return JSON.parse(agent.capabilities) as string[];
    }
  } catch {
    // ignore
  }
  return [] as string[];
});
</script>

<div class="space-y-4 p-4">
  <div class="space-y-1">
    <h3 class="text-sm font-semibold">Status</h3>
    <StatusBadge status={agent.status} />
  </div>

  <div class="flex flex-wrap gap-1">
    <Button variant="outline" size="sm" class="h-7 text-xs" onclick={onHeartbeat}>
      <HeartPulseIcon class="mr-1 size-3" />
      Heartbeat
    </Button>
    <Button variant="outline" size="sm" class="h-7 text-xs" onclick={onMessage}>
      <SendIcon class="mr-1 size-3" />
      Message
    </Button>
    <Button variant="destructive" size="sm" class="h-7 text-xs" onclick={onUnregister}>
      <Trash2Icon class="mr-1 size-3" />
      Unregister
    </Button>
  </div>

  <Separator />

  <div class="space-y-2">
    <h3 class="text-sm font-semibold">Details</h3>
    <div class="space-y-1.5 text-xs">
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Runtime</span>
        <span class="font-medium">{agent.runtime}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Role</span>
        <span class="font-medium">{agent.role}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Task</span>
        {#if agent.current_task_id}
          <span class="font-mono text-[10px]">{agent.current_task_id}</span>
        {:else}
          <span class="text-muted-foreground">-</span>
        {/if}
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Heartbeat</span>
        <span><RelativeTime timestamp={agent.last_heartbeat} /></span>
      </div>
    </div>
  </div>

  {#if agent.workflow_id}
    <div class="text-xs">
      <span class="text-muted-foreground">Workflow:</span>
      <a href="/workflows/{agent.workflow_id}" class="ml-1 font-mono text-primary hover:underline">
        {agent.workflow_id}
      </a>
    </div>
  {/if}

  {#if capabilities.length > 0}
    <div class="space-y-1">
      <h3 class="text-sm font-semibold">Capabilities</h3>
      <div class="flex flex-wrap gap-1">
        {#each capabilities as cap}
          <Badge variant="secondary" class="text-[10px]">{cap}</Badge>
        {/each}
      </div>
    </div>
  {/if}
</div>
