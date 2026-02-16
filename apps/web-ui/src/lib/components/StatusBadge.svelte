<script lang="ts">
import { cn, statusColors } from '$lib/utils';

interface Props {
  status: string;
  class?: string;
}

const { status, class: className }: Props = $props();
</script>

<span
  class={cn(
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
    statusColors[status] ?? 'bg-gray-200 text-gray-800',
    className,
  )}
>
  {status.replace(/_/g, ' ')}
</span>
