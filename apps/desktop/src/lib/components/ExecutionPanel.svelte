<script lang="ts">
import PauseIcon from '@lucide/svelte/icons/pause';
import PlayIcon from '@lucide/svelte/icons/play';
import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
import { api, type Workflow } from '$lib/api/client';
import { Button } from '$lib/components/ui/button/index.js';

interface Props {
  workflow: Workflow;
  onRefresh: () => void;
}

const { workflow, onRefresh }: Props = $props();

let loading = $state<string | null>(null);
let error = $state<string | null>(null);

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

<div class="flex items-center gap-2">
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
{#if error}
  <p class="text-sm text-destructive">{error}</p>
{/if}
