<script lang="ts">
import type { AlertDialog as AlertDialogPrimitive } from 'bits-ui';

let {
  open = $bindable(false),
  onOpenChange,
  ...restProps
}: AlertDialogPrimitive.RootProps = $props();

function handleOpenChange(value: boolean) {
  open = value;
  onOpenChange?.(value);
}
</script>

<AlertDialogPrimitive.Root {open} onOpenChange={handleOpenChange} {...restProps} />
