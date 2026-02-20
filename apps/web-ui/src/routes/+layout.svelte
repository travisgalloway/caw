<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { page } from '$app/stores';
import { wsStore } from '$lib/stores/ws';
import '../app.css';

const { children } = $props();

onMount(() => {
  wsStore.connect();
});

onDestroy(() => {
  wsStore.disconnect();
});

const navItems = [
  { href: '/', label: 'Workflows', icon: '▶' },
  { href: '/agents', label: 'Agents', icon: '🤖' },
  { href: '/templates', label: 'Templates', icon: '📋' },
  { href: '/messages', label: 'Messages', icon: '✉' },
  { href: '/setup', label: 'Setup', icon: '⚙' },
  { href: '/help', label: 'Help', icon: '?' },
];
</script>

<div class="flex h-screen bg-white dark:bg-gray-950">
  <!-- Sidebar -->
  <nav class="flex w-56 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
    <div class="flex h-14 items-center border-b border-gray-200 px-4 dark:border-gray-800">
      <h1 class="text-lg font-bold tracking-tight">caw</h1>
      <span class="ml-2 text-xs text-gray-400">web ui</span>
    </div>

    <div class="flex flex-1 flex-col gap-1 p-2">
      {#each navItems as item}
        <a
          href={item.href}
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors
            {$page.url.pathname === item.href || ($page.url.pathname.startsWith(item.href) && item.href !== '/')
              ? 'bg-gray-200 font-medium text-gray-900 dark:bg-gray-800 dark:text-white'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
        >
          <span class="w-5 text-center">{item.icon}</span>
          {item.label}
        </a>
      {/each}
    </div>

    <div class="border-t border-gray-200 p-3 dark:border-gray-800">
      <div class="flex items-center gap-2 text-xs text-gray-400">
        <span class="h-2 w-2 rounded-full {$wsStore.connected ? 'bg-green-500' : 'bg-red-500'}"></span>
        {$wsStore.connected ? 'Connected' : 'Disconnected'}
      </div>
    </div>
  </nav>

  <!-- Main content -->
  <main class="flex-1 overflow-auto">
    {@render children()}
  </main>
</div>
