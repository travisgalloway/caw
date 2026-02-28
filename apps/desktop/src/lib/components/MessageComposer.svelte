<script lang="ts">
import { api } from '$lib/api/client';
import { Button } from '$lib/components/ui/button/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import * as Sheet from '$lib/components/ui/sheet/index.js';
import { Textarea } from '$lib/components/ui/textarea/index.js';

interface Props {
  open: boolean;
  recipientId?: string;
  workflowId?: string;
  onOpenChange?: (open: boolean) => void;
  onSent?: () => void;
}

let {
  open = $bindable(false),
  recipientId = '',
  workflowId,
  onOpenChange,
  onSent,
}: Props = $props();

let recipient = $state('');
let subject = $state('');
let body = $state('');
let messageType = $state('query');
let priority = $state('normal');
let submitting = $state(false);
let error = $state<string | null>(null);

$effect(() => {
  if (recipientId) {
    recipient = recipientId;
  }
});

function reset() {
  subject = '';
  body = '';
  messageType = 'query';
  priority = 'normal';
  error = null;
}

async function handleSend() {
  if (!recipient.trim() || !body.trim()) {
    error = 'Recipient and body are required.';
    return;
  }
  submitting = true;
  error = null;
  try {
    await api.sendMessage({
      recipient_id: recipient.trim(),
      message_type: messageType,
      subject: subject.trim() || undefined,
      body: body.trim(),
      priority,
      workflow_id: workflowId,
    });
    reset();
    open = false;
    onSent?.();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    submitting = false;
  }
}
</script>

<Sheet.Root bind:open {onOpenChange}>
  <Sheet.Content>
    <Sheet.Header>
      <Sheet.Title>Send Message</Sheet.Title>
      <Sheet.Description>Send a message to an agent.</Sheet.Description>
    </Sheet.Header>

    <form
      onsubmit={(e) => { e.preventDefault(); handleSend(); }}
      class="space-y-4 p-4"
    >
      {#if error}
        <div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      {/if}

      <div class="space-y-2">
        <Label for="msg-recipient">Recipient Agent ID</Label>
        <Input id="msg-recipient" bind:value={recipient} placeholder="ag_..." />
      </div>

      <div class="space-y-2">
        <Label for="msg-type">Type</Label>
        <select
          id="msg-type"
          bind:value={messageType}
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="query">Query</option>
          <option value="task_assignment">Task Assignment</option>
          <option value="status_update">Status Update</option>
          <option value="response">Response</option>
          <option value="broadcast">Broadcast</option>
        </select>
      </div>

      <div class="space-y-2">
        <Label for="msg-priority">Priority</Label>
        <select
          id="msg-priority"
          bind:value={priority}
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      <div class="space-y-2">
        <Label for="msg-subject">Subject</Label>
        <Input id="msg-subject" bind:value={subject} placeholder="Optional subject" />
      </div>

      <div class="space-y-2">
        <Label for="msg-body">Body</Label>
        <Textarea id="msg-body" bind:value={body} rows={4} placeholder="Message body..." />
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <Button variant="outline" type="button" onclick={() => { open = false; }}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Sending...' : 'Send'}
        </Button>
      </div>
    </form>
  </Sheet.Content>
</Sheet.Root>
