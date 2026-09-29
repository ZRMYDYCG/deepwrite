<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.editorPaneToggle");

defineProps<{
  rightPane?: boolean;
  rightPaneCollapsed?: boolean;
}>();
const emit = defineEmits<{ collapse: []; toggleRight: [] }>();
</script>

<template>
  <button
    v-if="rightPane !== false"
    class="icon-button editor-pane-toggle"
    type="button"
    :aria-label="t('collapseTextPane')"
    @click="emit('collapse')"
  >
    <AppIcon name="panel-right" :size="18" />
  </button>
  <button
    v-else-if="rightPaneCollapsed"
    class="icon-button editor-pane-toggle"
    type="button"
    :aria-label="t('expandAgentPane')"
    @click="emit('toggleRight')"
  >
    <AppIcon name="panel-right" :size="18" />
  </button>
</template>

<style scoped>
.editor-pane-toggle {
  flex: 0 0 auto;
  margin-left: auto;
}
</style>
