<script lang="ts">
import { cn } from '$lib/utils';

interface Props {
  completed: number;
  total: number;
  class?: string;
}

const { completed, total, class: className }: Props = $props();
const percent = $derived(total > 0 ? Math.round((completed / total) * 100) : 0);
</script>

<div class={cn('flex items-center gap-2', className)}>
  <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
    <div
      class="h-full rounded-full bg-green-500 transition-all duration-300"
      style="width: {percent}%"
    ></div>
  </div>
  <span class="text-xs text-gray-500 tabular-nums">{completed}/{total}</span>
</div>
