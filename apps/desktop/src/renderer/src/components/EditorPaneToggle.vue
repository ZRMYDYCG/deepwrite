<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

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
    aria-label="收起文本内容栏"
    @click="emit('collapse')"
  >
    <AppIcon name="panel-right" :size="18" />
  </button>
  <button
    v-else-if="rightPaneCollapsed"
    class="icon-button editor-pane-toggle"
    type="button"
    aria-label="展开智能体栏"
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
