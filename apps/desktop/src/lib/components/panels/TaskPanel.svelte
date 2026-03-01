<script lang="ts">
import type { Agent, Task } from '$lib/api/client';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';

interface Props {
  task: Task;
  agents: Agent[];
  deps: {
    dependencies: Array<{ task_id: string; depends_on_id: string; dependency_type: string }>;
    dependents: Array<{ task_id: string; depends_on_id: string; dependency_type: string }>;
  } | null;
  workflowId: string;
}

const { task, deps, workflowId }: Props = $props();
</script>

<div class="space-y-4 p-4">
  <div class="space-y-1">
    <h3 class="text-sm font-semibold">Status</h3>
    <StatusBadge status={task.status} />
  </div>

  <div class="space-y-2">
    <h3 class="text-sm font-semibold">Details</h3>
    <div class="space-y-1.5 text-xs">
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Sequence</span>
        <span class="font-medium">{task.sequence}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Group</span>
        <span class="font-medium">{task.parallel_group ?? '-'}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Agent</span>
        {#if task.assigned_agent_id}
          <a href="/agents/{task.assigned_agent_id}" class="font-mono text-primary hover:underline">
            {task.assigned_agent_id}
          </a>
        {:else}
          <span class="text-muted-foreground">-</span>
        {/if}
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">Updated</span>
        <span><RelativeTime timestamp={task.updated_at} /></span>
      </div>
    </div>
  </div>

  {#if deps && (deps.dependencies.length > 0 || deps.dependents.length > 0)}
    <Separator />
    <div class="space-y-2">
      <h3 class="text-sm font-semibold">Dependencies</h3>
      {#if deps.dependencies.length > 0}
        <div>
          <p class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Depends on</p>
          <div class="space-y-1">
            {#each deps.dependencies as dep}
              <div class="flex items-center gap-1">
                <a
                  href="/workflows/{workflowId}/tasks/{dep.depends_on_id}"
                  class="truncate font-mono text-[10px] text-primary hover:underline"
                >
                  {dep.depends_on_id}
                </a>
                <Badge variant="outline" class="text-[9px] px-1 py-0">{dep.dependency_type}</Badge>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      {#if deps.dependents.length > 0}
        <div>
          <p class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Blocks</p>
          <div class="space-y-1">
            {#each deps.dependents as dep}
              <div class="flex items-center gap-1">
                <a
                  href="/workflows/{workflowId}/tasks/{dep.task_id}"
                  class="truncate font-mono text-[10px] text-primary hover:underline"
                >
                  {dep.task_id}
                </a>
                <Badge variant="outline" class="text-[9px] px-1 py-0">{dep.dependency_type}</Badge>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
