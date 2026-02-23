<script lang="ts">
import { cn } from '$lib/utils';

interface Props {
  connected?: boolean;
  class?: string;
}

const { connected = true, class: className }: Props = $props();
</script>

<span
  class={cn(
    'inline-block h-2 w-2 rounded-full',
    connected ? 'bg-green-500 animate-pulse-dot' : 'bg-red-500',
    className,
  )}
  aria-label={connected ? 'Connected' : 'Disconnected'}
></span>
