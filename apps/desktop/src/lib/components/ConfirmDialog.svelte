<script lang="ts">
import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'default';
  onconfirm?: () => void;
  oncancel?: () => void;
}

let {
  open = $bindable(),
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'default',
  onconfirm,
  oncancel,
}: Props = $props();

function handleOpenChange(isOpen: boolean) {
  if (!isOpen) {
    oncancel?.();
  }
  open = isOpen;
}
</script>

<AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{title}</AlertDialog.Title>
      <AlertDialog.Description>{message}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={oncancel}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class={confirmVariant === 'danger' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
        onclick={onconfirm}
      >
        {confirmLabel}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
