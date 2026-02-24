<script lang="ts">
import type { AlertDialog as AlertDialogPrimitive } from 'bits-ui';

const { ...restProps }: AlertDialogPrimitive.TriggerProps = $props();
</script>

<AlertDialogPrimitive.Trigger {...restProps} />
