<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { relativeTime } from '$lib/utils';

interface Props {
  timestamp: number;
}

const { timestamp }: Props = $props();
const display = $derived(relativeTime(timestamp));
let interval: ReturnType<typeof setInterval>;

onMount(() => {
  interval = setInterval(() => {
    // Force reactivity by accessing timestamp in the update
    display;
  }, 10_000);
});

onDestroy(() => {
  clearInterval(interval);
});
</script>

<time datetime={new Date(timestamp).toISOString()} title={new Date(timestamp).toLocaleString()}>
  {display}
</time>
