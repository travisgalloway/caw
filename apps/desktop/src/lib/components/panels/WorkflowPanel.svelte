<script lang="ts">
import LockIcon from '@lucide/svelte/icons/lock';
import UnlockIcon from '@lucide/svelte/icons/unlock';
import { api, type ProgressResult, type Workflow } from '$lib/api/client';
import ProgressBar from '$lib/components/ProgressBar.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Button } from '$lib/components/ui/button/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';

interface Props {
  workflow: Workflow;
  progress: ProgressResult | null;
  agentCount: number;
  onRefresh: () => void;
}

const { workflow, progress, agentCount, onRefresh }: Props = $props();

const WORKFLOW_TRANSITIONS: Record<string, string[]> = {
  planning: ['ready', 'abandoned'],
  ready: ['in_progress', 'abandoned'],
  in_progress: ['paused', 'completed', 'failed', 'abandoned'],
  paused: ['in_progress', 'abandoned'],
  failed: ['in_progress'],
};

const validTransitions = $derived(WORKFLOW_TRANSITIONS[workflow.status] ?? []);
const isLocked = $derived(!!workflow.locked_by_session_id);

let actionLoading = $state<string | null>(null);
let actionError = $state<string | null>(null);

async function handleStatusChange(e: Event) {
  const select = e.target as HTMLSelectElement;
  const newStatus = select.value;
  if (!newStatus) return;
  actionLoading = 'status';
  actionError = null;
  try {
    await api.updateWorkflowStatus(workflow.id, newStatus);
    onRefresh();
  } catch (err) {
    actionError = err instanceof Error ? err.message : String(err);
  } finally {
    actionLoading = null;
    select.value = '';
  }
}
</script>

<div class="space-y-4 p-4">
  <div class="space-y-1">
    <h3 class="text-sm font-semibold">Status</h3>
    <StatusBadge status={workflow.status} />
  </div>

  {#if validTransitions.length > 0}
    <div class="space-y-1">
      <label for="wf-status" class="text-xs font-medium text-muted-foreground">Change status</label>
      <select
        id="wf-status"
        class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        disabled={actionLoading === 'status'}
        onchange={handleStatusChange}
      >
        <option value="">Select...</option>
        {#each validTransitions as status}
          <option value={status}>{status.replace(/_/g, ' ')}</option>
        {/each}
      </select>
    </div>
  {/if}

  {#if actionError}
    <p class="text-xs text-destructive">{actionError}</p>
  {/if}

  {#if progress}
    <div class="space-y-2">
      <h3 class="text-sm font-semibold">Progress</h3>
      <ProgressBar
        completed={progress.by_status.completed ?? 0}
        total={progress.total_tasks}
      />
      <div class="grid grid-cols-2 gap-2 text-xs">
        {#each Object.entries(progress.by_status) as [status, count]}
          <div class="flex items-center justify-between rounded bg-muted px-2 py-1">
            <span class="text-muted-foreground">{status.replace(/_/g, ' ')}</span>
            <span class="font-medium">{count}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <Separator />

  <div class="space-y-2">
    <h3 class="text-sm font-semibold">Details</h3>
    <div class="space-y-1.5 text-xs">
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Source</span>
        <span class="font-medium">{workflow.source_type}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Agents</span>
        <span class="font-medium">{agentCount}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Lock</span>
        <Button
          variant="ghost"
          size="sm"
          class="h-5 px-1 text-xs"
          disabled={actionLoading === 'lock'}
        >
          {#if isLocked}
            <UnlockIcon class="mr-1 size-3" />Locked
          {:else}
            <LockIcon class="mr-1 size-3" />Unlocked
          {/if}
        </Button>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Created</span>
        <span><RelativeTime timestamp={workflow.created_at} /></span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Updated</span>
        <span><RelativeTime timestamp={workflow.updated_at} /></span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">ID</span>
        <span class="font-mono text-[10px]">{workflow.id}</span>
      </div>
    </div>
  </div>
</div>
