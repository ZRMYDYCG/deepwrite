<script setup lang="ts">
import { createScopedTranslator } from "../i18n";

const t = createScopedTranslator("components.approvalDiscardButton");
withDefaults(
  defineProps<{
    discarding?: boolean;
  }>(),
  {
    discarding: false
  }
);

const emit = defineEmits<{
  discard: [];
}>();
</script>

<template>
  <button
    class="approval-target-button approval-discard-button"
    type="button"
    :title="t('discardTheseChanges')"
    :aria-label="t('discardTheseChanges')"
    :disabled="discarding"
    @click.stop="emit('discard')"
  >
    {{ discarding ? t("discarding") : t("discardTheseChanges") }}
  </button>
</template>
