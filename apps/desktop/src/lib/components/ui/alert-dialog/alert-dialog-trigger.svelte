<script lang="ts">
import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';

const { ...restProps }: AlertDialogPrimitive.TriggerProps = $props();
</script>

<AlertDialogPrimitive.Trigger {...restProps} />
