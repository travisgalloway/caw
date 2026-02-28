<script lang="ts">
import PauseIcon from '@lucide/svelte/icons/pause';
import PlayIcon from '@lucide/svelte/icons/play';
import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
import { api, type ProgressResult, type Workflow } from '$lib/api/client';
import ProgressBar from '$lib/components/ProgressBar.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';

interface Props {
  workflow: Workflow;
  progress: ProgressResult | null;
  agentCount: number;
  onRefresh: () => void;
}

const { workflow, progress, agentCount, onRefresh }: Props = $props();

let loading = $state<string | null>(null);
let error = $state<string | null>(null);

const completedTasks = $derived(
  progress ? (progress.by_status['completed'] ?? 0) + (progress.by_status['skipped'] ?? 0) : 0,
);

const canStart = $derived(workflow.status === 'ready' || workflow.status === 'planning');
const canPause = $derived(workflow.status === 'in_progress');
const canResume = $derived(workflow.status === 'paused' || workflow.status === 'failed');

async function handleStart() {
  loading = 'start';
  error = null;
  try {
    await api.startExecution(workflow.id);
    onRefresh();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = null;
  }
}

async function handlePause() {
  loading = 'pause';
  error = null;
  try {
    await api.suspendExecution(workflow.id);
    onRefresh();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = null;
  }
}

async function handleResume() {
  loading = 'resume';
  error = null;
  try {
    await api.resumeExecution(workflow.id);
    onRefresh();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = null;
  }
}
</script>

<Card.Root>
  <Card.Content class="flex items-center gap-4 p-4">
    <div class="flex items-center gap-2">
      <StatusBadge status={workflow.status} />
      {#if workflow.locked_by_session_id}
        <span
          class="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
        >
          Locked
        </span>
      {/if}
    </div>

    {#if progress}
      <div class="flex-1 max-w-xs">
        <ProgressBar completed={completedTasks} total={progress.total_tasks} />
      </div>
    {/if}

    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
    </div>

    <div class="ml-auto flex items-center gap-2">
      {#if canStart}
        <Button size="sm" onclick={handleStart} disabled={loading === 'start'}>
          <PlayIcon class="mr-1 size-4" />
          Start
        </Button>
      {/if}
      {#if canPause}
        <Button size="sm" variant="outline" onclick={handlePause} disabled={loading === 'pause'}>
          <PauseIcon class="mr-1 size-4" />
          Pause
        </Button>
      {/if}
      {#if canResume}
        <Button size="sm" variant="outline" onclick={handleResume} disabled={loading === 'resume'}>
          <RotateCcwIcon class="mr-1 size-4" />
          Resume
        </Button>
      {/if}
    </div>
  </Card.Content>
  {#if error}
    <Card.Footer class="border-t px-4 py-2">
      <p class="text-sm text-destructive">{error}</p>
    </Card.Footer>
  {/if}
</Card.Root>
