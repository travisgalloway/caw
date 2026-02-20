<script lang="ts">
import Dialog from './Dialog.svelte';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'default';
  onconfirm?: () => void;
  oncancel?: () => void;
}

const {
  open,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'default',
  onconfirm,
  oncancel,
}: Props = $props();

const confirmButtonClass = $derived(
  confirmVariant === 'danger'
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-blue-600 text-white hover:bg-blue-700',
);
</script>

<Dialog {open} onclose={oncancel}>
  {#snippet header()}
    <h3 class="text-lg font-semibold">{title}</h3>
  {/snippet}

  <p class="text-sm text-gray-600 dark:text-gray-300">{message}</p>
  <div class="mt-4 flex justify-end gap-2">
    <button
      class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      onclick={oncancel}
    >
      Cancel
    </button>
    <button
      class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {confirmButtonClass}"
      onclick={onconfirm}
    >
      {confirmLabel}
    </button>
  </div>
</Dialog>
