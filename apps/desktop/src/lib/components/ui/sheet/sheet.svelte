<script lang="ts">
import { Dialog as SheetPrimitive } from 'bits-ui';

let { open = $bindable(false), onOpenChange, ...restProps }: SheetPrimitive.RootProps = $props();

function handleOpenChange(value: boolean) {
  open = value;
  onOpenChange?.(value);
}
</script>

<SheetPrimitive.Root {open} onOpenChange={handleOpenChange} {...restProps} />
