<script lang="ts">
import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
import PlayIcon from '@lucide/svelte/icons/play';
import { onDestroy, onMount } from 'svelte';
import { page } from '$app/stores';
import { api, type WorkflowTemplate } from '$lib/api/client';
import ApplyTemplateDialog from '$lib/components/ApplyTemplateDialog.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';

let template = $state<WorkflowTemplate | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);
let applyDialogOpen = $state(false);
let pollInterval: ReturnType<typeof setInterval>;

const templateId = $derived($page.params.id ?? '');

interface TemplateTask {
  name?: string;
  description?: string;
  depends_on?: string[];
  complexity?: string;
  parallel_group?: string;
}

interface ParsedTemplate {
  tasks: TemplateTask[];
  variables: string[];
}

function parseTemplate(tmpl: WorkflowTemplate): ParsedTemplate {
  try {
    const parsed = JSON.parse(tmpl.template);
    return {
      tasks: (parsed.tasks ?? []) as TemplateTask[],
      variables: (parsed.variables ?? []) as string[],
    };
  } catch {
    return { tasks: [], variables: [] };
  }
}

const parsed = $derived(template ? parseTemplate(template) : { tasks: [], variables: [] });

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

async function loadTemplate() {
  try {
    const result = await api.getTemplate(templateId);
    template = result.data;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

onMount(() => {
  loadTemplate();
  pollInterval = setInterval(loadTemplate, 5000);
});

onDestroy(() => {
  clearInterval(pollInterval);
});
</script>

<div class="p-6 space-y-6">
  {#if loading}
    <div class="space-y-4">
      <Skeleton class="h-6 w-48" />
      <Skeleton class="h-8 w-64" />
      <div class="grid gap-4 sm:grid-cols-2">
        <Skeleton class="h-32 w-full" />
        <Skeleton class="h-32 w-full" />
      </div>
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if template}
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <Breadcrumb.Item>
          <Breadcrumb.Link href="/templates">Templates</Breadcrumb.Link>
        </Breadcrumb.Item>
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          <Breadcrumb.Page>{template.name}</Breadcrumb.Page>
        </Breadcrumb.Item>
      </Breadcrumb.List>
    </Breadcrumb.Root>

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold tracking-tight">{template.name}</h2>
        <Badge variant="outline">v{template.version}</Badge>
        <Badge variant="outline" class={sourceBadgeClass(template.source)}>
          {sourceLabel(template.source)}
        </Badge>
      </div>
      <Button size="sm" onclick={() => { applyDialogOpen = true; }}>
        <PlayIcon class="mr-1.5 size-4" />
        Apply Template
      </Button>
    </div>

    {#if template.description}
      <p class="text-sm text-muted-foreground">{template.description}</p>
    {/if}

    <!-- Variables Card -->
    {#if parsed.variables.length > 0}
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm font-semibold text-muted-foreground">
            Variables ({parsed.variables.length})
          </Card.Title>
        </Card.Header>
        <Card.Content class="pt-0">
          <div class="flex flex-wrap gap-2">
            {#each parsed.variables as variable}
              <Badge variant="secondary" class="font-mono text-xs">
                {`{{${variable}}}`}
              </Badge>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Tasks Card -->
    {#if parsed.tasks.length > 0}
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm font-semibold text-muted-foreground">
            Tasks ({parsed.tasks.length})
          </Card.Title>
        </Card.Header>
        <Card.Content class="pt-0">
          <div class="space-y-3">
            {#each parsed.tasks as task, i}
              <div class="rounded-md border p-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {i + 1}
                    </span>
                    <span class="text-sm font-medium">{task.name ?? `Task ${i + 1}`}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    {#if task.complexity}
                      <Badge variant="outline" class="text-xs">{task.complexity}</Badge>
                    {/if}
                    {#if task.parallel_group}
                      <Badge variant="secondary" class="text-xs">group: {task.parallel_group}</Badge>
                    {/if}
                  </div>
                </div>
                {#if task.description}
                  <p class="mt-1.5 pl-7 text-xs text-muted-foreground">{task.description}</p>
                {/if}
                {#if task.depends_on && task.depends_on.length > 0}
                  <div class="mt-2 flex items-center gap-1.5 pl-7">
                    <ArrowRightIcon class="size-3 text-muted-foreground" />
                    <span class="text-xs text-muted-foreground">
                      depends on: {task.depends_on.join(', ')}
                    </span>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <Separator />

    <!-- Metadata -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">ID</p>
          <p class="mt-1 font-mono text-xs">{template.id}</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Source</p>
          <p class="mt-1 text-sm">{sourceLabel(template.source)}</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Created</p>
          <p class="mt-1 text-sm"><RelativeTime timestamp={template.created_at} /></p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Content class="p-3">
          <p class="text-xs font-medium text-muted-foreground">Updated</p>
          <p class="mt-1 text-sm"><RelativeTime timestamp={template.updated_at} /></p>
        </Card.Content>
      </Card.Root>
    </div>
  {/if}
</div>

<ApplyTemplateDialog
  {template}
  bind:open={applyDialogOpen}
  onClose={() => { applyDialogOpen = false; }}
/>
