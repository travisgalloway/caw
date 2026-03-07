<script lang="ts">
import InboxIcon from '@lucide/svelte/icons/inbox';
import ListIcon from '@lucide/svelte/icons/list';
import SettingsIcon from '@lucide/svelte/icons/settings';
import { page } from '$app/stores';
import SidebarWorkflowItem from '$lib/components/SidebarWorkflowItem.svelte';
import * as Sidebar from '$lib/components/ui/sidebar/index.js';
import { useSidebar } from '$lib/components/ui/sidebar/index.js';
import type { SidebarData } from '$lib/stores/sidebar-data.svelte';

interface Props {
  data: SidebarData;
  isTauri?: boolean;
}

const { data }: Props = $props();

const sidebar = useSidebar();
const isCollapsed = $derived(sidebar.state === 'collapsed');
const pathname = $derived($page.url.pathname);
</script>

<Sidebar.Root collapsible="icon" variant="sidebar">
  <Sidebar.Header class="pt-1 pb-0" />
  <Sidebar.Content>
    <!-- Top-level navigation -->
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={pathname === '/messages' || pathname.startsWith('/messages/')}
            >
              {#snippet child({ props })}
                <a href="/messages" {...props}>
                  <InboxIcon class="size-4" />
                  <span>Messages</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
            {#if data.unreadCount > 0}
              <Sidebar.MenuBadge>{data.unreadCount}</Sidebar.MenuBadge>
            {/if}
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={pathname === '/'}
            >
              {#snippet child({ props })}
                <a href="/" {...props}>
                  <ListIcon class="size-4" />
                  <span>Workflows</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    <Sidebar.Separator class="mx-2" />

    <!-- Active Workflows -->
    <Sidebar.Group>
      <Sidebar.GroupLabel
        class={isCollapsed
          ? 'group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-100 justify-center'
          : ''}
      >
        {#if isCollapsed}
          <span class="flex size-5 items-center justify-center rounded-md bg-sidebar-accent text-[10px] font-semibold">
            {data.activeWorkflows.length}
          </span>
        {:else}
          Active
        {/if}
      </Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#each data.activeWorkflows as wf (wf.id)}
            {@const wfActive =
              pathname === `/workflows/${wf.id}` || pathname.startsWith(`/workflows/${wf.id}/`)}
            <SidebarWorkflowItem
              workflow={wf}
              agents={data.agentsByWorkflow.get(wf.id) ?? []}
              isActive={wfActive}
              {pathname}
            />
          {:else}
            {#if !isCollapsed}
              <Sidebar.MenuItem>
                <span class="px-2 py-1 text-xs text-muted-foreground">No active workflows</span>
              </Sidebar.MenuItem>
            {/if}
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer class="border-t border-sidebar-border">
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          isActive={pathname.startsWith('/settings')}
        >
          {#snippet child({ props })}
            <a href="/settings" {...props}>
              <SettingsIcon class="size-4" />
              <span>Settings</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>

  <Sidebar.Rail />
</Sidebar.Root>
