<script lang="ts">
import type { Task, TaskDependency } from '$lib/api/client';
import StatusBadge from './StatusBadge.svelte';

interface Props {
  tasks: Task[];
  dependencies: TaskDependency[];
  workflowId: string;
}

interface TreeNode {
  task: Task;
  children: TreeNode[];
  hasChildren: boolean;
}

const { tasks, dependencies, workflowId }: Props = $props();

// Build a map of task ID to task for quick lookup
const taskMap = $derived.by(() => {
  const map = new Map<string, Task>();
  for (const task of tasks) {
    map.set(task.id, task);
  }
  return map;
});

// Build a map of parent task ID to child task IDs based on dependencies
const childrenMap = $derived.by(() => {
  const map = new Map<string, Set<string>>();
  for (const dep of dependencies) {
    if (!map.has(dep.depends_on_id)) {
      map.set(dep.depends_on_id, new Set());
    }
    map.get(dep.depends_on_id)?.add(dep.task_id);
  }
  return map;
});

// Find root tasks (tasks with no dependencies)
const rootTaskIds = $derived.by(() => {
  const taskIds = new Set(tasks.map((t) => t.id));
  const childIds = new Set<string>();
  for (const dep of dependencies) {
    childIds.add(dep.task_id);
  }
  return Array.from(taskIds).filter((id) => !childIds.has(id));
});

// Build tree structure recursively
function buildTreeNode(taskId: string): TreeNode | null {
  const task = taskMap.get(taskId);
  if (!task) return null;

  const childIds = Array.from(childrenMap.get(taskId) ?? []);
  const children = childIds.map((id) => buildTreeNode(id)).filter((n): n is TreeNode => n !== null);

  return {
    task,
    children,
    hasChildren: children.length > 0,
  };
}

const rootNodes = $derived(
  rootTaskIds
    .map((id) => buildTreeNode(id))
    .filter((n): n is TreeNode => n !== null)
    .sort((a, b) => a.task.sequence - b.task.sequence),
);

// Collapsible state: track which nodes are collapsed by task ID
let collapsed = $state(new Set<string>());

function toggleCollapse(taskId: string) {
  const newCollapsed = new Set(collapsed);
  if (newCollapsed.has(taskId)) {
    newCollapsed.delete(taskId);
  } else {
    newCollapsed.add(taskId);
  }
  collapsed = newCollapsed;
}

function isCollapsed(taskId: string): boolean {
  return collapsed.has(taskId);
}

// Helper to render tree nodes recursively
function renderTree(nodes: TreeNode[], depth = 0): void {}
</script>

{#snippet treeNode(node: TreeNode, depth: number)}
  {@const paddingLeft = depth * 20 + 16}
  {@const isNodeCollapsed = isCollapsed(node.task.id)}

  <div>
    <div
      class="flex items-center gap-2 border-b border-gray-100 px-4 py-2 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
      style="padding-left: {paddingLeft}px"
    >
      {#if node.hasChildren}
        <button
          onclick={() => toggleCollapse(node.task.id)}
          class="flex h-5 w-5 flex-shrink-0 items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label={isNodeCollapsed ? 'Expand' : 'Collapse'}
        >
          {#if isNodeCollapsed}
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          {:else}
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          {/if}
        </button>
      {:else}
        <span class="w-5 flex-shrink-0"></span>
      {/if}

      <span class="w-8 flex-shrink-0 tabular-nums text-xs text-gray-400">{node.task.sequence}</span>

      <div class="min-w-0 flex-1">
        <a
          href="/workflows/{workflowId}/tasks/{node.task.id}"
          class="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          {node.task.name}
        </a>
        {#if node.task.description}
          <p class="mt-0.5 truncate text-xs text-gray-400" title={node.task.description}>
            {node.task.description}
          </p>
        {/if}
      </div>

      <div class="flex flex-shrink-0 items-center gap-3">
        <StatusBadge status={node.task.status} />
        {#if node.task.parallel_group}
          <span class="text-xs text-gray-400">{node.task.parallel_group}</span>
        {/if}
      </div>
    </div>

    {#if node.hasChildren && !isNodeCollapsed}
      {#each node.children as child}
        {@render treeNode(child, depth + 1)}
      {/each}
    {/if}
  </div>
{/snippet}

<div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
  {#if rootNodes.length === 0}
    <div class="px-4 py-8 text-center text-sm text-gray-500">No tasks to display</div>
  {:else}
    <div class="divide-y divide-gray-100 dark:divide-gray-800">
      {#each rootNodes as node}
        {@render treeNode(node, 0)}
      {/each}
    </div>
  {/if}
</div>
