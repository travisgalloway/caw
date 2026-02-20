<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { api, type WorkflowTemplate } from '$lib/api/client';
import ApplyTemplateDialog from '$lib/components/ApplyTemplateDialog.svelte';
import { wsStore } from '$lib/stores/ws';

let templates = $state<WorkflowTemplate[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let pollInterval: ReturnType<typeof setInterval>;

// Apply template dialog state
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

function closeApplyDialog() {
  applyDialogOpen = false;
  selectedTemplate = null;
}

onMount(() => {
  loadTemplates();
  pollInterval = setInterval(loadTemplates, 5000);
});

onDestroy(() => {
  clearInterval(pollInterval);
});

// Reload on WebSocket events
$effect(() => {
  const event = $wsStore.lastEvent;
  if (event?.type?.startsWith('template:')) {
    loadTemplates();
  }
});
</script>

<div class="p-6">
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Workflow Templates</h2>
      <p class="text-sm text-gray-500">
        {templates.length} template{templates.length !== 1 ? 's' : ''}
      </p>
    </div>
    <button
      class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
      onclick={() => {
        // TODO: Navigate to template creation page or show creation dialog
        alert('Template creation UI coming soon. Use MCP tools to create templates.');
      }}
    >
      Create Template
    </button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <span class="text-gray-400">Loading...</span>
    </div>
  {:else if error}
    <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
      {error}
    </div>
  {:else if templates.length === 0}
    <div class="flex flex-col items-center justify-center py-12 text-gray-400">
      <p class="text-lg">No templates found</p>
      <p class="text-sm">Create a template via MCP tools to get started.</p>
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each templates as template}
        <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <div class="mb-3">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {template.name}
            </h3>
            {#if template.description}
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {template.description}
              </p>
            {/if}
          </div>

          <div class="mb-4 flex items-center gap-4 text-sm text-gray-500">
            <div>
              <span class="font-medium">{getTaskCount(template)}</span> task{getTaskCount(template) !== 1 ? 's' : ''}
            </div>
            <div class="text-xs text-gray-400">v{template.version}</div>
          </div>

          <button
            class="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            onclick={() => openApplyDialog(template)}
          >
            Apply Template
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Apply Template Dialog -->
<ApplyTemplateDialog
  template={selectedTemplate}
  open={applyDialogOpen}
  onClose={closeApplyDialog}
/>
