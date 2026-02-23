<script lang="ts">
import { goto } from '$app/navigation';
import { api, type WorkflowTemplate } from '$lib/api/client';
import { Badge } from '$lib/components/ui/badge/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Dialog from '$lib/components/ui/dialog/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';

interface Props {
  template: WorkflowTemplate | null;
  open: boolean;
  onClose: () => void;
}

let { template, open = $bindable(), onClose }: Props = $props();

let workflowName = $state('');
let variables = $state<Record<string, string>>({});
let applying = $state(false);
let error = $state<string | null>(null);

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

function handleOpenChange(isOpen: boolean) {
  if (!isOpen) {
    onClose();
  }
  open = isOpen;
}
</script>

<Dialog.Root open={open && template !== null} onOpenChange={handleOpenChange}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Apply Template</Dialog.Title>
      <Dialog.Description>Create a new workflow from a template.</Dialog.Description>
    </Dialog.Header>

    {#if template}
      <div class="rounded-md border bg-muted/50 p-4">
        <h4 class="mb-2 font-medium">{template.name}</h4>
        {#if template.description}
          <p class="mb-3 text-sm text-muted-foreground">{template.description}</p>
        {/if}
        <div class="flex items-center gap-3 text-xs text-muted-foreground">
          <Badge variant="secondary">
            {templateData.taskCount} task{templateData.taskCount !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="outline">v{template.version}</Badge>
          {#if templateData.variables.length > 0}
            <Badge variant="outline">
              {templateData.variables.length} variable{templateData.variables.length !== 1 ? 's' : ''}
            </Badge>
          {/if}
        </div>
      </div>

      <form
        onsubmit={(e) => { e.preventDefault(); handleApply(); }}
        class="space-y-4"
      >
        <div class="space-y-2">
          <Label for="workflow-name">Workflow Name</Label>
          <Input
            id="workflow-name"
            bind:value={workflowName}
            placeholder="Enter workflow name"
            disabled={applying}
            required
          />
        </div>

        {#if templateData.variables.length > 0}
          <div class="space-y-3">
            <Label>Template Variables</Label>
            {#each templateData.variables as variable}
              <div class="space-y-1">
                <Label for="var-{variable}" class="text-xs text-muted-foreground">{variable}</Label>
                <Input
                  id="var-{variable}"
                  bind:value={variables[variable]}
                  placeholder="Enter {variable}"
                  disabled={applying}
                />
              </div>
            {/each}
          </div>
        {/if}

        {#if error}
          <div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        {/if}

        <Dialog.Footer>
          <Button variant="outline" type="button" onclick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button type="submit" disabled={applying || !workflowName.trim()}>
            {applying ? 'Creating...' : 'Create Workflow'}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
