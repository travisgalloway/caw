<script lang="ts">
import { Badge } from '$lib/components/ui/badge/index.js';
import { cn } from '$lib/utils';

interface Props {
  status: string;
  class?: string;
}

const { status, class: className }: Props = $props();

const statusVariantMap: Record<string, string> = {
  completed:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  in_progress:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  failed:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  paused:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  pending:
    'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  blocked:
    'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  planning:
    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  ready:
    'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
  abandoned:
    'bg-gray-200 text-gray-600 border-gray-300 dark:bg-gray-900 dark:text-gray-500 dark:border-gray-700',
  skipped:
    'bg-gray-200 text-gray-600 border-gray-300 dark:bg-gray-900 dark:text-gray-500 dark:border-gray-700',
  online:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  offline:
    'bg-gray-200 text-gray-600 border-gray-300 dark:bg-gray-900 dark:text-gray-500 dark:border-gray-700',
  idle: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
  busy: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  sent: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  delivered:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  read: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

const statusClass = $derived(
  statusVariantMap[status] ??
    'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
);
</script>

<Badge variant="outline" class={cn(statusClass, className)}>
  {status.replace(/_/g, ' ')}
</Badge>
