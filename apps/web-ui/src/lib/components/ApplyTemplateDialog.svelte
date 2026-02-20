<script lang="ts">
import { goto } from '$app/navigation';
import { api, type WorkflowTemplate } from '$lib/api/client';

interface Props {
  template: WorkflowTemplate | null;
  open: boolean;
  onClose: () => void;
}

const { template, open, onClose }: Props = $props();

let workflowName = $state('');
let variables = $state<Record<string, string>>({});
let applying = $state(false);
let error = $state<string | null>(null);

// Parse template to extract variables and task count
const templateData = $derived.by(() => {
  if (!template) return { variables: [], taskCount: 0 };

  try {
    const parsed = JSON.parse(template.template);
    return {
      variables: (parsed.variables ?? []) as string[],
      taskCount: (parsed.tasks?.length ?? 0) as number,
    };
  } catch {
    return { variables: [], taskCount: 0 };
  }
});

// Reset state when dialog opens
$effect(() => {
  if (open) {
    workflowName = '';
    variables = {};
    error = null;
    applying = false;
  }
});

async function handleApply() {
  if (!template || !workflowName.trim()) {
    error = 'Workflow name is required';
    return;
  }

  // Check for missing variables
  const missingVars = templateData.variables.filter((v) => !variables[v]?.trim());
  if (missingVars.length > 0) {
    error = `Missing required variables: ${missingVars.join(', ')}`;
    return;
  }

  applying = true;
  error = null;

  try {
    const result = await api.applyTemplate(template.id, {
      workflow_name: workflowName.trim(),
      variables: Object.keys(variables).length > 0 ? variables : undefined,
    });
    onClose();
    goto(`/workflows/${result.data.workflow_id}`);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    applying = false;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    onClose();
  } else if (e.key === 'Enter' && !applying) {
    handleApply();
  }
}
</script>

{#if open && template}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    onkeydown={handleKeydown}
  >
    <div class="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
      <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Apply Template
      </h3>

      <!-- Template Details -->
      <div class="mb-6 rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
        <h4 class="mb-2 font-medium text-gray-900 dark:text-white">
          {template.name}
        </h4>
        {#if template.description}
          <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
            {template.description}
          </p>
        {/if}
        <div class="flex items-center gap-4 text-xs text-gray-500">
          <div>
            <span class="font-medium">{templateData.taskCount}</span> task{templateData.taskCount !== 1 ? 's' : ''}
          </div>
          <div>Version {template.version}</div>
          {#if templateData.variables.length > 0}
            <div>
              {templateData.variables.length} variable{templateData.variables.length !== 1 ? 's' : ''}
            </div>
          {/if}
        </div>
      </div>

      <!-- Form -->
      <div class="space-y-4">
        <!-- Workflow Name -->
        <div>
          <label for="workflow-name" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Workflow Name <span class="text-red-500">*</span>
          </label>
          <input
            id="workflow-name"
            type="text"
            bind:value={workflowName}
            placeholder="Enter workflow name"
            class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            disabled={applying}
          />
        </div>

        <!-- Template Variables -->
        {#if templateData.variables.length > 0}
          <div>
            <p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Template Variables
            </p>
            <div class="space-y-3">
              {#each templateData.variables as variable}
                <div>
                  <label for="var-{variable}" class="mb-1 block text-xs text-gray-600 dark:text-gray-400">
                    {variable} <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="var-{variable}"
                    type="text"
                    bind:value={variables[variable]}
                    placeholder="Enter {variable}"
                    class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                    disabled={applying}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Error -->
      {#if error}
        <div class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      {/if}

      <!-- Actions -->
      <div class="mt-6 flex justify-end gap-2">
        <button
          class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          onclick={onClose}
          disabled={applying}
        >
          Cancel
        </button>
        <button
          class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          onclick={handleApply}
          disabled={applying || !workflowName.trim()}
        >
          {applying ? 'Creating...' : 'Create Workflow'}
        </button>
      </div>
    </div>
  </div>
{/if}
