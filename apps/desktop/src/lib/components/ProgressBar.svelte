<script lang="ts">
import { Progress } from '$lib/components/ui/progress/index.js';
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
  <Progress value={percent} class="flex-1" />
  <span class="text-xs text-muted-foreground tabular-nums">{completed}/{total}</span>
</div>
