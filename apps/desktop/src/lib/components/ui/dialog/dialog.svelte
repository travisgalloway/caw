<script lang="ts">
import type { Dialog as DialogPrimitive } from 'bits-ui';

let { open = $bindable(false), onOpenChange, ...restProps }: DialogPrimitive.RootProps = $props();

function handleOpenChange(value: boolean) {
  open = value;
  onOpenChange?.(value);
}
</script>

<DialogPrimitive.Root {open} onOpenChange={handleOpenChange} {...restProps} />
