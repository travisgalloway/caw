<script lang="ts">
const { children } = $props();
</script>

<div class="h-screen overflow-auto bg-background text-foreground">
  {@render children()}
</div>
