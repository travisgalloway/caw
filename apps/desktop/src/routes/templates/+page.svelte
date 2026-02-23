<script lang="ts">
import FileTextIcon from '@lucide/svelte/icons/file-text';
import { onDestroy, onMount } from 'svelte';
import { api, type WorkflowTemplate } from '$lib/api/client';
import ApplyTemplateDialog from '$lib/components/ApplyTemplateDialog.svelte';
import EmptyState from '$lib/components/EmptyState.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import { wsStore } from '$lib/stores/ws';

let templates = $state<WorkflowTemplate[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let pollInterval: ReturnType<typeof setInterval>;
let applyDialogOpen = $state(false);
let selectedTemplate = $state<WorkflowTemplate | null>(null);

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

function getTaskCount(template: WorkflowTemplate): number {
  try {
    const parsed = JSON.parse(template.template);
    return parsed?.tasks?.length ?? 0;
  } catch {
    return 0;
  }
}

function openApplyDialog(template: WorkflowTemplate) {
  selectedTemplate = template;
  applyDialogOpen = true;
}

onMount(() => {
  loadTemplates();
  pollInterval = setInterval(loadTemplates, 5000);
});

onDestroy(() => {
  clearInterval(pollInterval);
});

$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type?.startsWith('template:')) {
    loadTemplates();
  }
});
</script>

<div class="p-6 space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Workflow Templates</h2>
      <p class="text-sm text-muted-foreground">
        {templates.length} template{templates.length !== 1 ? 's' : ''}
      </p>
    </div>
  </div>

  {#if loading}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _}
        <Card.Root><Card.Content class="p-4"><Skeleton class="h-32 w-full" /></Card.Content></Card.Root>
      {/each}
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if templates.length === 0}
    <EmptyState
      icon={FileTextIcon}
      title="No templates"
      description="Create a template via MCP tools or the CLI to get started."
    />
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each templates as template}
        <Card.Root class="transition-shadow hover:shadow-md">
          <Card.Header>
            <Card.Title class="text-base">{template.name}</Card.Title>
            {#if template.description}
              <Card.Description>{template.description}</Card.Description>
            {/if}
          </Card.Header>
          <Card.Content>
            <div class="flex items-center gap-3 text-sm text-muted-foreground">
              <Badge variant="secondary">
                {getTaskCount(template)} task{getTaskCount(template) !== 1 ? 's' : ''}
              </Badge>
              <Badge variant="outline">v{template.version}</Badge>
              <span class="text-xs">
                <RelativeTime timestamp={template.updated_at} />
              </span>
            </div>
          </Card.Content>
          <Card.Footer>
            <Button class="w-full" onclick={() => openApplyDialog(template)}>
              Apply Template
            </Button>
          </Card.Footer>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>

<ApplyTemplateDialog
  template={selectedTemplate}
  open={applyDialogOpen}
  onClose={() => { applyDialogOpen = false; selectedTemplate = null; }}
/>
