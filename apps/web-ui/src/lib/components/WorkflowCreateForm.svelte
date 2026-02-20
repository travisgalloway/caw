<script lang="ts">
import { api } from '$lib/api/client';
import Dialog from './Dialog.svelte';

interface Props {
  open: boolean;
  onclose?: () => void;
  oncreate?: (workflowId: string) => void;
}

const { open, onclose, oncreate }: Props = $props();

// Form state
let name = $state('');
let sourceType = $state<string>('prompt');
let sourceContent = $state('');
let sourceRef = $state('');
let maxParallelTasks = $state(3);

// UI state
let loading = $state(false);
let error = $state<string | null>(null);

// Validation
const isValid = $derived(() => {
  if (!name.trim()) return false;
  if (!sourceType) return false;
  if (sourceType === 'prompt' && !sourceContent.trim()) return false;
  if (sourceType !== 'prompt' && !sourceRef.trim()) return false;
  return true;
});

async function handleSubmit(e: Event) {
  e.preventDefault();

  if (!isValid()) return;

  loading = true;
  error = null;

  try {
    const params: {
      name: string;
      source_type: string;
      source_content?: string;
      source_ref?: string;
      max_parallel_tasks?: number;
    } = {
      name: name.trim(),
      source_type: sourceType,
      max_parallel_tasks: maxParallelTasks,
    };

    if (sourceType === 'prompt') {
      params.source_content = sourceContent.trim();
    } else {
      params.source_ref = sourceRef.trim();
    }

    // Use fetch directly since the API client type doesn't include all fields yet
    const response = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message ?? `HTTP ${response.status}`);
    }

    const result = await response.json();

    // Reset form
    name = '';
    sourceType = 'prompt';
    sourceContent = '';
    sourceRef = '';
    maxParallelTasks = 3;

    oncreate?.(result.data.id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

function handleCancel() {
  if (!loading) {
    // Reset form on cancel
    name = '';
    sourceType = 'prompt';
    sourceContent = '';
    sourceRef = '';
    maxParallelTasks = 3;
    error = null;

    onclose?.();
  }
}
</script>

<Dialog {open} onclose={handleCancel}>
  {#snippet header()}
    <h3 class="text-lg font-semibold">Create New Workflow</h3>
  {/snippet}

  <form onsubmit={handleSubmit}>
    <!-- Name field -->
    <div class="mb-4">
      <label for="workflow-name" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Name <span class="text-red-500">*</span>
      </label>
      <input
        id="workflow-name"
        type="text"
        bind:value={name}
        placeholder="Enter workflow name"
        required
        disabled={loading}
        class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm transition-colors
          placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
          disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500
          dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500
          dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-800"
      />
    </div>

    <!-- Source Type field -->
    <div class="mb-4">
      <label for="source-type" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Source Type <span class="text-red-500">*</span>
      </label>
      <select
        id="source-type"
        bind:value={sourceType}
        required
        disabled={loading}
        class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm transition-colors
          focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
          disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500
          dark:border-gray-700 dark:bg-gray-900 dark:text-white
          dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-800"
      >
        <option value="prompt">Prompt</option>
        <option value="github_issue">GitHub Issue</option>
        <option value="linear">Linear</option>
        <option value="jira">Jira</option>
        <option value="spec_file">Spec File</option>
        <option value="custom">Custom</option>
      </select>
    </div>

    <!-- Conditional Source Content / Source Ref -->
    {#if sourceType === 'prompt'}
      <div class="mb-4">
        <label for="source-content" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Prompt <span class="text-red-500">*</span>
        </label>
        <textarea
          id="source-content"
          bind:value={sourceContent}
          placeholder="Describe the workflow tasks and objectives..."
          required
          disabled={loading}
          rows="6"
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm transition-colors
            placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
            disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500
            dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500
            dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-800"
        ></textarea>
      </div>
    {:else}
      <div class="mb-4">
        <label for="source-ref" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {#if sourceType === 'github_issue'}
            GitHub Issue URL
          {:else if sourceType === 'linear'}
            Linear Issue URL
          {:else if sourceType === 'jira'}
            Jira Issue URL
          {:else if sourceType === 'spec_file'}
            Spec File Path
          {:else}
            Source Reference
          {/if}
          <span class="text-red-500">*</span>
        </label>
        <input
          id="source-ref"
          type="text"
          bind:value={sourceRef}
          placeholder={sourceType === 'spec_file' ? '/path/to/spec.md' : 'https://...'}
          required
          disabled={loading}
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm transition-colors
            placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
            disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500
            dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500
            dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-800"
        />
      </div>
    {/if}

    <!-- Max Parallel Tasks field -->
    <div class="mb-4">
      <label for="max-parallel-tasks" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Max Parallel Tasks
      </label>
      <input
        id="max-parallel-tasks"
        type="number"
        bind:value={maxParallelTasks}
        min="1"
        max="10"
        disabled={loading}
        class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm transition-colors
          focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
          disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500
          dark:border-gray-700 dark:bg-gray-900 dark:text-white
          dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-gray-800"
      />
      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Number of tasks that can run concurrently (1-10)
      </p>
    </div>

    <!-- Error message -->
    {#if error}
      <div class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
        {error}
      </div>
    {/if}

    <!-- Form actions -->
    <div class="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
      <button
        type="button"
        onclick={handleCancel}
        disabled={loading}
        class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors
          hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50
          dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={loading || !isValid()}
        class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors
          hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50
          dark:bg-blue-500 dark:hover:bg-blue-600"
      >
        {loading ? 'Creating...' : 'Create'}
      </button>
    </div>
  </form>
</Dialog>
