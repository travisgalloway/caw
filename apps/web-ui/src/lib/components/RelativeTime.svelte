<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { relativeTime } from '$lib/utils';

interface Props {
  timestamp: number;
}

const { timestamp }: Props = $props();
let now = $state(Date.now());
const display = $derived(relativeTime(timestamp, now));
let interval: ReturnType<typeof setInterval>;

onMount(() => {
  interval = setInterval(() => {
    now = Date.now();
  }, 10_000);
});

onDestroy(() => {
  clearInterval(interval);
});
</script>

<time datetime={new Date(timestamp).toISOString()} title={new Date(timestamp).toLocaleString()}>
  {display}
</time>
