<script lang="ts">
import type { Component, Snippet } from 'svelte';

interface Props {
  icon?: Component;
  title: string;
  description?: string;
  action?: Snippet;
}

const { icon: Icon, title, description, action }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-12 text-center">
  {#if Icon}
    <div class="mb-4 rounded-full bg-muted p-3">
      <Icon class="h-6 w-6 text-muted-foreground" />
    </div>
  {/if}
  <h3 class="text-lg font-medium">{title}</h3>
  {#if description}
    <p class="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
  {/if}
  {#if action}
    <div class="mt-4">
      {@render action()}
    </div>
  {/if}
</div>
