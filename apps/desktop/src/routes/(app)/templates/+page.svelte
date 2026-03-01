<script lang="ts">
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import PlayIcon from '@lucide/svelte/icons/play';
import { onDestroy, onMount } from 'svelte';
import { api, type WorkflowTemplate } from '$lib/api/client';
import ApplyTemplateDialog from '$lib/components/ApplyTemplateDialog.svelte';
import EmptyState from '$lib/components/EmptyState.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import { commandStore } from '$lib/stores/command';
import { wsStore } from '$lib/stores/ws';

let templates = $state<WorkflowTemplate[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let searchQuery = $state('');
let sourceFilter = $state<'all' | 'file' | 'db'>('all');
let expandedCards = $state<Set<string>>(new Set());
let pollInterval: ReturnType<typeof setInterval>;

let applyDialogOpen = $state(false);
let applyTemplate = $state<WorkflowTemplate | null>(null);

interface ParsedTemplate {
  tasks: Array<{ name?: string; description?: string; depends_on?: string[] }>;
  variables: string[];
}

function parseTemplate(tmpl: WorkflowTemplate): ParsedTemplate {
  try {
    const parsed = JSON.parse(tmpl.template);
    return {
      tasks: (parsed.tasks ?? []) as ParsedTemplate['tasks'],
      variables: (parsed.variables ?? []) as string[],
    };
  } catch {
    return { tasks: [], variables: [] };
  }
}

const filteredTemplates = $derived.by(() => {
  let result = templates;
  if (sourceFilter === 'file') {
    result = result.filter((t) => t.source?.startsWith('file:'));
  } else if (sourceFilter === 'db') {
    result = result.filter((t) => !t.source || t.source === 'db');
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
    );
  }
  return result;
});

async function loadTemplates() {
  try {
    const result = await api.listTemplates();
    templates = result.data;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

function toggleExpanded(id: string) {
  const next = new Set(expandedCards);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedCards = next;
}

function openApplyDialog(tmpl: WorkflowTemplate) {
  applyTemplate = tmpl;
  applyDialogOpen = true;
}

function sourceLabel(source?: string): string {
  if (!source || source === 'db') return 'db';
  return source;
}

function sourceBadgeClass(source?: string): string {
  if (!source || source === 'db') {
    return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800';
  }
  if (source === 'file:repo') {
    return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800';
  }
  return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800';
}

onMount(() => {
  loadTemplates();
  pollInterval = setInterval(loadTemplates, 5000);

  commandStore.registerActions([
    {
      id: 'template-refresh',
      label: 'Refresh Templates',
      group: 'Actions',
      onSelect: () => loadTemplates(),
    },
  ]);
});

onDestroy(() => {
  clearInterval(pollInterval);
  commandStore.unregisterActions(['template-refresh']);
});

$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type?.startsWith('template:')) {
    loadTemplates();
  }
});
</script>

<div class="px-5 py-4 space-y-4">
  <div class="flex items-center gap-2">
    <input
      type="text"
      placeholder="Search templates..."
      bind:value={searchQuery}
      class="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />
    <div class="flex rounded-md border border-input">
      {#each [['all', 'All'], ['file', 'File'], ['db', 'DB']] as [value, label]}
        <button
          onclick={() => { sourceFilter = value as 'all' | 'file' | 'db'; }}
          class="px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md {sourceFilter === value
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent'}"
        >
          {label}
        </button>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(6) as _}
        <Card.Root>
          <Card.Content class="p-4 space-y-3">
            <Skeleton class="h-5 w-32" />
            <Skeleton class="h-4 w-48" />
            <div class="flex gap-2">
              <Skeleton class="h-5 w-16 rounded-full" />
              <Skeleton class="h-5 w-16 rounded-full" />
            </div>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if filteredTemplates.length === 0}
    <EmptyState
      icon={FileTextIcon}
      title="No templates found"
      description={searchQuery || sourceFilter !== 'all'
        ? 'Try adjusting your search or filter.'
        : 'Create templates via MCP tools or add .yaml files to .caw/templates/.'}
    />
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each filteredTemplates as tmpl (tmpl.id)}
        {@const parsed = parseTemplate(tmpl)}
        <Card.Root class="flex flex-col transition-colors hover:border-primary/50">
          <Card.Header class="pb-2">
            <div class="flex items-center justify-between">
              <Card.Title class="text-sm">
                <a
                  href="/templates/{tmpl.id}"
                  class="font-medium text-primary hover:underline"
                >
                  {tmpl.name}
                </a>
              </Card.Title>
              <Badge variant="outline" class="text-xs">v{tmpl.version}</Badge>
            </div>
            {#if tmpl.description}
              <p class="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
            {/if}
          </Card.Header>
          <Card.Content class="flex-1 space-y-3 pb-3">
            <div class="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" class={sourceBadgeClass(tmpl.source)}>
                {sourceLabel(tmpl.source)}
              </Badge>
              <Badge variant="secondary">
                {parsed.tasks.length} task{parsed.tasks.length !== 1 ? 's' : ''}
              </Badge>
              {#if parsed.variables.length > 0}
                <Badge variant="outline">
                  {parsed.variables.length} var{parsed.variables.length !== 1 ? 's' : ''}
                </Badge>
              {/if}
            </div>

            {#if parsed.tasks.length > 0}
              <div>
                <button
                  onclick={() => toggleExpanded(tmpl.id)}
                  class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {#if expandedCards.has(tmpl.id)}
                    <ChevronUpIcon class="size-3" />
                  {:else}
                    <ChevronDownIcon class="size-3" />
                  {/if}
                  Tasks
                </button>
                {#if expandedCards.has(tmpl.id)}
                  <ul class="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {#each parsed.tasks as task}
                      <li class="flex items-start gap-1.5">
                        <span class="mt-1 block size-1 shrink-0 rounded-full bg-muted-foreground/50"></span>
                        {task.name ?? 'Unnamed task'}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </Card.Content>
          <Card.Footer class="pt-0">
            <Button
              variant="outline"
              size="sm"
              class="w-full"
              onclick={() => openApplyDialog(tmpl)}
            >
              <PlayIcon class="mr-1.5 size-3.5" />
              Apply Template
            </Button>
          </Card.Footer>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>

<ApplyTemplateDialog
  template={applyTemplate}
  bind:open={applyDialogOpen}
  onClose={() => { applyDialogOpen = false; applyTemplate = null; }}
/>
