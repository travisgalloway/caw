<script lang="ts">
import type { Snippet } from 'svelte';

interface Props {
  open: boolean;
  onclose?: () => void;
  header?: Snippet;
  children: Snippet;
}

const { open, onclose, header, children }: Props = $props();

let dialogEl = $state<HTMLDialogElement>();

$effect(() => {
  if (!dialogEl) return;
  if (open && !dialogEl.open) {
    dialogEl.showModal();
  } else if (!open && dialogEl.open) {
    dialogEl.close();
  }
});

function handleClose() {
  onclose?.();
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === dialogEl) {
    onclose?.();
  }
}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogEl}
  onclose={handleClose}
  onclick={handleBackdropClick}
  class="w-full max-w-md rounded-lg border border-gray-200 bg-white p-0 shadow-lg backdrop:bg-black/50 dark:border-gray-800 dark:bg-gray-950"
>
  {#if open}
    {#if header}
      <div class="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        {@render header()}
      </div>
    {/if}
    <div class="px-5 py-4">
      {@render children()}
    </div>
  {/if}
</dialog>
