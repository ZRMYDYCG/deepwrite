<script setup lang="ts">
import { t } from "../i18n";
import AppIcon from "./AppIcon.vue";

defineProps<{
  leftCollapsed: boolean;
  expandButtonClass: string;
  label: string;
}>();

const emit = defineEmits<{
  expandLeft: [];
}>();
</script>

<template>
  <main :aria-label="label">
    <button
      v-if="leftCollapsed"
      class="icon-button"
      :class="expandButtonClass"
      type="button"
      :aria-label="t('components.workspaceFeatureFrame.expandSidebar')"
      @click="emit('expandLeft')"
    >
      <AppIcon name="panel-left" :size="18" />
    </button>
    <slot />
  </main>
</template>
