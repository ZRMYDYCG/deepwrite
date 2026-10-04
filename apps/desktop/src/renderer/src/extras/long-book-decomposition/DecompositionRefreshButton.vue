<script setup lang="ts">
import AppIcon from "../../components/AppIcon.vue";
import { createScopedTranslator } from "../../i18n";
const t = createScopedTranslator("extras.longBookDecomposition");
defineProps<{ disabled?: boolean }>();
defineEmits<{ click: [] }>();
</script>
<template>
  <button
    type="button"
    class="analysis-refresh-button"
    :title="t('refresh')"
    :aria-label="t('refresh')"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <AppIcon name="refresh" :size="16" />
  </button>
</template>
