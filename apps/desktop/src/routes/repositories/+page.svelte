<script lang="ts">
import FolderGitIcon from '@lucide/svelte/icons/folder-git';
import PlusIcon from '@lucide/svelte/icons/plus';
import { onDestroy, onMount } from 'svelte';
import { api, type Repository } from '$lib/api/client';
import EmptyState from '$lib/components/EmptyState.svelte';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import * as Dialog from '$lib/components/ui/dialog/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import * as Table from '$lib/components/ui/table/index.js';
import { formatDate } from '$lib/utils';

let repositories = $state<Repository[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let pollInterval: ReturnType<typeof setInterval>;

// Register dialog
let showRegister = $state(false);
let regName = $state('');
let regPath = $state('');
let regError = $state<string | null>(null);
let regSubmitting = $state(false);

async function loadData() {
  try {
    const result = await api.listRepositories();
    repositories = result.data;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

async function handleRegister() {
  if (!regName.trim() || !regPath.trim()) {
    regError = 'Name and path are required.';
    return;
  }
  regSubmitting = true;
  regError = null;
  try {
    await api.registerRepository({ name: regName.trim(), path: regPath.trim() });
    showRegister = false;
    regName = '';
    regPath = '';
    await loadData();
  } catch (err) {
    regError = err instanceof Error ? err.message : String(err);
  } finally {
    regSubmitting = false;
  }
}

onMount(() => {
  loadData();
  pollInterval = setInterval(loadData, 10000);
});

onDestroy(() => {
  clearInterval(pollInterval);
});
</script>

<Dialog.Root bind:open={showRegister}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Register Repository</Dialog.Title>
      <Dialog.Description>Add a repository to the global registry.</Dialog.Description>
    </Dialog.Header>
    {#if regError}
      <div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        {regError}
      </div>
    {/if}
    <form onsubmit={(e) => { e.preventDefault(); handleRegister(); }} class="space-y-4">
      <div class="space-y-2">
        <Label for="repo-name">Name</Label>
        <Input id="repo-name" bind:value={regName} placeholder="my-repo" required />
      </div>
      <div class="space-y-2">
        <Label for="repo-path">Path</Label>
        <Input id="repo-path" bind:value={regPath} placeholder="/path/to/repo" required />
      </div>
      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={() => { showRegister = false; }}>Cancel</Button>
        <Button type="submit" disabled={regSubmitting}>
          {regSubmitting ? 'Registering...' : 'Register'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<div class="p-6 space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Repositories</h2>
      <p class="text-sm text-muted-foreground">Registered repositories for global mode</p>
    </div>
    <Button size="sm" onclick={() => { showRegister = true; }}>
      <PlusIcon class="mr-1 size-4" />
      Register
    </Button>
  </div>

  {#if loading}
    <Card.Root>
      <Card.Content class="p-0">
        {#each Array(3) as _}
          <div class="flex gap-4 border-b border-border px-4 py-3 last:border-0">
            <Skeleton class="h-4 w-32" />
            <Skeleton class="h-4 w-48" />
            <Skeleton class="h-4 w-24" />
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if repositories.length === 0}
    <EmptyState
      icon={FolderGitIcon}
      title="No repositories"
      description="Register repositories to use global mode across multiple projects."
    />
  {:else}
    <Card.Root>
      <Card.Content class="p-0">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              <Table.Head>Path</Table.Head>
              <Table.Head>Added</Table.Head>
              <Table.Head class="text-right">ID</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each repositories as repo}
              <Table.Row>
                <Table.Cell class="font-medium">{repo.name}</Table.Cell>
                <Table.Cell class="font-mono text-xs text-muted-foreground">{repo.path}</Table.Cell>
                <Table.Cell class="text-muted-foreground">{formatDate(repo.added_at)}</Table.Cell>
                <Table.Cell class="text-right font-mono text-xs text-muted-foreground">{repo.id}</Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
