<script lang="ts">
import BotIcon from '@lucide/svelte/icons/bot';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import FolderGitIcon from '@lucide/svelte/icons/folder-git';
import HelpCircleIcon from '@lucide/svelte/icons/help-circle';
import LayoutIcon from '@lucide/svelte/icons/layout-grid';
import MailIcon from '@lucide/svelte/icons/mail';
import SearchIcon from '@lucide/svelte/icons/search';
import SettingsIcon from '@lucide/svelte/icons/settings';
import WrenchIcon from '@lucide/svelte/icons/wrench';
import { onDestroy, onMount } from 'svelte';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { api } from '$lib/api/client';
import CommandPalette from '$lib/components/CommandPalette.svelte';
import KeyboardShortcutsDialog from '$lib/components/KeyboardShortcutsDialog.svelte';
import LiveIndicator from '$lib/components/LiveIndicator.svelte';
import * as Sidebar from '$lib/components/ui/sidebar/index.js';
import { Toaster } from '$lib/components/ui/sonner/index.js';
import { commandStore } from '$lib/stores/command';
import { handleWsToast } from '$lib/stores/toast';
import { wsStore } from '$lib/stores/ws';
import '../app.css';

const { children } = $props();

let shortcutsOpen = $state(false);
let unreadCount = $state(0);
let pendingGo = $state('');
let goTimer: ReturnType<typeof setTimeout> | null = null;

const navItems = [
  { href: '/', label: 'Workflows', icon: LayoutIcon },
  { href: '/agents', label: 'Agents', icon: BotIcon },
  { href: '/templates', label: 'Templates', icon: FileTextIcon },
  { href: '/messages', label: 'Messages', icon: MailIcon, badge: () => unreadCount },
  { href: '/repositories', label: 'Repositories', icon: FolderGitIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
  { href: '/setup', label: 'Setup', icon: WrenchIcon },
  { href: '/help', label: 'Help', icon: HelpCircleIcon },
];

function isActive(href: string): boolean {
  const path = $page.url.pathname;
  if (href === '/') return path === '/';
  return path === href || path.startsWith(href + '/');
}

async function loadUnread() {
  try {
    const res = await api.getUnreadCount();
    if (res.data) {
      unreadCount = res.data.count;
    }
  } catch {
    // ignore
  }
}

onMount(() => {
  wsStore.connect();
  wsStore.subscribeChannel('global');
  loadUnread();
});

onDestroy(() => {
  wsStore.unsubscribeChannel('global');
  wsStore.disconnect();
  if (goTimer) clearTimeout(goTimer);
});

// Toast on WS events + refresh unread count
let lastEventRef: unknown = null;
$effect(() => {
  const event = $wsStore.lastEvent;
  if (event && event !== lastEventRef) {
    lastEventRef = event;
    handleWsToast(event);
    if (event.type === 'message:new' || event.type === 'message:read') {
      loadUnread();
    }
  }
});

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  // Ignore when typing in inputs
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return;
  }

  // Cmd+K / Ctrl+K for command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    commandStore.toggle();
    return;
  }

  // ? for shortcuts help
  if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    shortcutsOpen = true;
    return;
  }

  // g + <key> for navigation
  if (pendingGo) {
    e.preventDefault();
    const goMap: Record<string, string> = {
      w: '/',
      a: '/agents',
      m: '/messages',
      t: '/templates',
      s: '/settings',
      r: '/repositories',
    };
    const target = goMap[e.key];
    if (target) goto(target);
    pendingGo = '';
    if (goTimer) clearTimeout(goTimer);
    return;
  }
  if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
    pendingGo = 'g';
    goTimer = setTimeout(() => {
      pendingGo = '';
    }, 1000);
  }
}

// Unread poll interval
let unreadTimer: ReturnType<typeof setInterval>;
onMount(() => {
  unreadTimer = setInterval(loadUnread, 15000);
});
onDestroy(() => {
  clearInterval(unreadTimer);
});
</script>

<svelte:window onkeydown={handleKeydown} />

<Sidebar.Provider>
  <Sidebar.Root collapsible="icon">
    <Sidebar.Header>
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton size="lg" class="cursor-default">
            <div
              class="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <span class="text-sm font-bold">C</span>
            </div>
            <div class="flex flex-col gap-0.5 leading-none">
              <span class="font-semibold">caw</span>
              <span class="text-xs text-muted-foreground">web dashboard</span>
            </div>
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Header>

    <Sidebar.Content>
      <Sidebar.Group>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each navItems as item}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton isActive={isActive(item.href)} tooltipContent={item.label}>
                  {#snippet child({ props })}
                    <a href={item.href} {...props}>
                      <item.icon class="size-4" />
                      <span>{item.label}</span>
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
                {#if item.badge && item.badge() > 0}
                  <Sidebar.MenuBadge>{item.badge()}</Sidebar.MenuBadge>
                {/if}
              </Sidebar.MenuItem>
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>

      <Sidebar.Group>
        <Sidebar.GroupLabel>Quick Actions</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                tooltipContent="Search"
                onclick={() => commandStore.toggle()}
              >
                <SearchIcon class="size-4" />
                <span>Search</span>
                <kbd
                  class="ml-auto inline-flex h-5 items-center rounded border border-sidebar-border bg-sidebar px-1 font-mono text-[10px] text-muted-foreground"
                >
                  ⌘K
                </kbd>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </Sidebar.Content>

    <Sidebar.Footer>
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton class="cursor-default">
            <LiveIndicator connected={$wsStore.connected} />
            <span class="text-xs">
              {$wsStore.connected ? 'Connected' : 'Disconnected'}
            </span>
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Footer>
    <Sidebar.Rail />
  </Sidebar.Root>

  <Sidebar.Inset>
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>

<Toaster richColors closeButton />
<CommandPalette />
<KeyboardShortcutsDialog bind:open={shortcutsOpen} />
