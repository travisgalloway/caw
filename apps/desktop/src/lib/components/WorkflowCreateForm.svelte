<script lang="ts">
import { api } from '$lib/api/client';
import { Button } from '$lib/components/ui/button/index.js';
import * as Dialog from '$lib/components/ui/dialog/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { Textarea } from '$lib/components/ui/textarea/index.js';

interface Props {
  open: boolean;
  onclose?: () => void;
  oncreate?: (workflowId: string) => void;
}

let { open = $bindable(), onclose, oncreate }: Props = $props();

let name = $state('');
let sourceType = $state<string>('prompt');
let sourceContent = $state('');
let sourceRef = $state('');
let maxParallelTasks = $state(3);
let loading = $state(false);
let error = $state<string | null>(null);

const isValid = $derived(
  name.trim() !== '' &&
    sourceType !== '' &&
    (sourceType === 'prompt' ? sourceContent.trim() !== '' : sourceRef.trim() !== ''),
);

async function handleSubmit(e: Event) {
  e.preventDefault();
  if (!isValid) return;

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

    const result = await api.createWorkflow(params);
    resetForm();
    oncreate?.(result.data.id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

function resetForm() {
  name = '';
  sourceType = 'prompt';
  sourceContent = '';
  sourceRef = '';
  maxParallelTasks = 3;
  error = null;
}

function handleCancel() {
  if (!loading) {
    resetForm();
    onclose?.();
  }
}

function handleOpenChange(isOpen: boolean) {
  if (!isOpen) {
    handleCancel();
  }
  open = isOpen;
}
</script>

<Dialog.Root open={open} onOpenChange={handleOpenChange}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Create New Workflow</Dialog.Title>
      <Dialog.Description>Define a workflow from a prompt or external source.</Dialog.Description>
    </Dialog.Header>

    <form onsubmit={handleSubmit} class="space-y-4">
      <div class="space-y-2">
        <Label for="workflow-name">Name</Label>
        <Input
          id="workflow-name"
          bind:value={name}
          placeholder="Enter workflow name"
          required
          disabled={loading}
        />
      </div>

      <div class="space-y-2">
        <Label for="source-type">Source Type</Label>
        <select
          id="source-type"
          bind:value={sourceType}
          required
          disabled={loading}
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="prompt">Prompt</option>
          <option value="github_issue">GitHub Issue</option>
          <option value="linear">Linear</option>
          <option value="jira">Jira</option>
          <option value="spec_file">Spec File</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {#if sourceType === 'prompt'}
        <div class="space-y-2">
          <Label for="source-content">Prompt</Label>
          <Textarea
            id="source-content"
            bind:value={sourceContent}
            placeholder="Describe the workflow tasks and objectives..."
            required
            disabled={loading}
            rows={6}
          />
        </div>
      {:else}
        <div class="space-y-2">
          <Label for="source-ref">
            {#if sourceType === 'github_issue'}GitHub Issue URL
            {:else if sourceType === 'linear'}Linear Issue URL
            {:else if sourceType === 'jira'}Jira Issue URL
            {:else if sourceType === 'spec_file'}Spec File Path
            {:else}Source Reference{/if}
          </Label>
          <Input
            id="source-ref"
            bind:value={sourceRef}
            placeholder={sourceType === 'spec_file' ? '/path/to/spec.md' : 'https://...'}
            required
            disabled={loading}
          />
        </div>
      {/if}

      <div class="space-y-2">
        <Label for="max-parallel-tasks">Max Parallel Tasks</Label>
        <Input
          id="max-parallel-tasks"
          type="number"
          bind:value={maxParallelTasks}
          min={1}
          max={10}
          disabled={loading}
        />
        <p class="text-xs text-muted-foreground">
          Number of tasks that can run concurrently (1-10)
        </p>
      </div>

      {#if error}
        <div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      {/if}

      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={handleCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !isValid}>
          {loading ? 'Creating...' : 'Create'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
