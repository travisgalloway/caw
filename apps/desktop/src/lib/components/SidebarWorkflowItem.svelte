<script lang="ts">
import BotIcon from '@lucide/svelte/icons/bot';
import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
import type { Agent, WorkflowSummary } from '$lib/api/client';
import * as Collapsible from '$lib/components/ui/collapsible/index.js';
import * as Sidebar from '$lib/components/ui/sidebar/index.js';

interface Props {
  workflow: WorkflowSummary;
  agents: Agent[];
  isActive: boolean;
  pathname: string;
}

const { workflow, agents, isActive, pathname }: Props = $props();

const statusColors: Record<string, string> = {
  planning: 'bg-status-planning',
  ready: 'bg-status-ready',
  in_progress: 'bg-status-in-progress',
  paused: 'bg-status-paused',
  completed: 'bg-status-completed',
  failed: 'bg-status-failed',
};

const hasAgents = $derived(agents.length > 0);
const dotColor = $derived(statusColors[workflow.status] ?? 'bg-muted-foreground');
</script>

{#if hasAgents}
  <Collapsible.Root open={isActive} class="group/collapsible">
    <Sidebar.MenuItem>
      <Collapsible.Trigger>
        {#snippet child({ props: triggerProps })}
          <Sidebar.MenuButton {...triggerProps} {isActive} class="pr-1">
            <span class="size-2 shrink-0 rounded-full {dotColor}"></span>
            <span class="truncate">{workflow.name}</span>
            <ChevronRightIcon
              class="ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
            />
          </Sidebar.MenuButton>
        {/snippet}
      </Collapsible.Trigger>
      <Collapsible.Content>
        <Sidebar.MenuSub>
          {#each agents as agent}
            {@const agentActive = pathname === `/agents/${agent.id}`}
            {@const agentDot =
              agent.status === 'online'
                ? 'bg-green-500'
                : agent.status === 'busy'
                  ? 'bg-amber-500'
                  : 'bg-muted-foreground'}
            <Sidebar.MenuSubItem>
              <Sidebar.MenuSubButton href="/agents/{agent.id}" isActive={agentActive}>
                <BotIcon class="size-3 shrink-0 text-muted-foreground" />
                <span class="truncate">{agent.name}</span>
                <span class="ml-auto size-1.5 shrink-0 rounded-full {agentDot}"></span>
              </Sidebar.MenuSubButton>
            </Sidebar.MenuSubItem>
          {/each}
        </Sidebar.MenuSub>
      </Collapsible.Content>
    </Sidebar.MenuItem>
  </Collapsible.Root>
{:else}
  <Sidebar.MenuItem>
    <Sidebar.MenuButton {isActive}>
      {#snippet child({ props })}
        <a href="/workflows/{workflow.id}" {...props}>
          <span class="size-2 shrink-0 rounded-full {dotColor}"></span>
          <span class="truncate">{workflow.name}</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>
{/if}
