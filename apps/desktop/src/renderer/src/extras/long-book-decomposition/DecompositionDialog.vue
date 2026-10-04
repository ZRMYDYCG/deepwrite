<script setup lang="ts">
import { onMounted, ref, useId } from "vue";
import { decompositionDialogKeydown } from "./dialog-keys";

defineProps<{
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const titleId = useId();
const messageId = useId();
const dialog = ref<HTMLElement | null>(null);
const cancel = ref<HTMLButtonElement | null>(null);

onMounted(() => cancel.value?.focus());
</script>
<template>
  <Teleport to="body">
    <div class="analysis-refresh-backdrop" @mousedown.self="emit('cancel')">
      <section
        ref="dialog"
        class="analysis-refresh-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="messageId"
        @keydown="
          decompositionDialogKeydown($event, dialog, () => emit('cancel'))
        "
      >
        <h2 :id="titleId">{{ title }}</h2>
        <p :id="messageId">{{ message }}</p>
        <div class="analysis-refresh-dialog-actions">
          <button ref="cancel" type="button" @click="emit('cancel')">
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="analysis-refresh-confirm"
            :class="{ 'is-danger': danger }"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
