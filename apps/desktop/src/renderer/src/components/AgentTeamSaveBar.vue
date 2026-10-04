<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.agentTeamSaveBar");

defineProps<{ dirty: boolean; saving: boolean; disabled: boolean }>();
const emit = defineEmits<{ save: []; discard: [] }>();
</script>

<template>
  <footer class="save-bar" :class="{ 'is-dirty': dirty }">
    <span class="save-status" role="status">
      <i class="status-dot" aria-hidden="true" />
      {{ dirty ? t("unsavedChanges") : t("allChangesSaved") }}
    </span>
    <div class="save-actions">
      <button
        v-if="dirty"
        type="button"
        class="secondary-button"
        :disabled="disabled"
        @click="emit('discard')"
      >
        {{ t("discardChanges") }}
      </button>
      <button
        type="button"
        class="primary-button"
        :disabled="disabled || !dirty"
        @click="emit('save')"
      >
        <AppIcon name="save" :size="15" />
        {{ saving ? t("saving") : t("saveAgentTeam") }}
      </button>
    </div>
  </footer>
</template>

<style scoped>
.save-bar {
  position: sticky;
  z-index: 3;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 10px 12px 10px 16px;
  border: 1px solid var(--theme-line);
  border-radius: 12px;
  background: var(--surface-raised);
  /* The second shadow masks content that would otherwise peek through the gap
     between the stuck bar and the bottom edge of the scroll container. */
  box-shadow:
    0 6px 22px rgb(0 0 0 / 0.1),
    0 56px 0 var(--surface-main);
}
.save-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 0.857143rem;
}
.save-bar.is-dirty .save-status {
  color: var(--text-secondary);
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-tertiary);
  opacity: 0.55;
}
.save-bar.is-dirty .status-dot {
  background: var(--warning-text, #b7791f);
  opacity: 1;
}
.save-actions {
  display: flex;
  gap: 8px;
}
.secondary-button,
.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 14px;
  border: 1px solid var(--theme-line);
  border-radius: 9px;
  font: inherit;
  font-size: 0.892857rem;
  font-weight: 600;
  cursor: pointer;
}
.secondary-button {
  background: var(--surface-main);
  color: var(--text-primary);
}
.secondary-button:hover:not(:disabled) {
  background: var(--surface-hover);
}
.primary-button {
  border-color: var(--neutral-solid);
  background: var(--neutral-solid);
  color: var(--accent-contrast, #fff);
}
.primary-button:hover:not(:disabled) {
  filter: brightness(1.12);
}
.secondary-button:disabled,
.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
