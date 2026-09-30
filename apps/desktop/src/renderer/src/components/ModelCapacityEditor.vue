<script setup lang="ts">
import { ref } from "vue";
import { createScopedTranslator } from "../i18n";
import type { DraftModel } from "./modelSettingsDraft";
import ModelAdvancedConfigDialog from "./ModelAdvancedConfigDialog.vue";

const t = createScopedTranslator("components.modelEditorPanel");
const props = defineProps<{ model: DraftModel; saving: boolean }>();
const emit = defineEmits<{
  save: [capacity: { contextWindow: number; maxTokens: number }];
}>();
const open = ref(false);

function save(capacity: { contextWindow: number; maxTokens: number }): void {
  emit("save", capacity);
  open.value = false;
}
</script>

<template>
  <div class="model-editor-advanced">
    <div>
      <strong>{{ t("advancedSettings") }}</strong>
      <span
        v-if="
          model.contextWindow !== undefined && model.maxTokens !== undefined
        "
      >
        {{
          t("configuredCapacity", {
            arg0: model.contextWindow.toLocaleString(),
            arg1: model.maxTokens.toLocaleString()
          })
        }}
      </span>
      <span v-else>{{ t("modelDefaultCapacity") }}</span>
    </div>
    <button type="button" :disabled="saving" @click="open = true">
      {{ t("configureCapacity") }}
    </button>
  </div>
  <ModelAdvancedConfigDialog
    :model="open ? props.model : null"
    :busy="saving"
    @close="open = false"
    @save="save"
  />
</template>

<style scoped>
.model-editor-advanced {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 13px;
  padding: 11px 12px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-muted);
}

.model-editor-advanced > div {
  display: grid;
  gap: 4px;
}

.model-editor-advanced strong {
  color: var(--text-primary);
  font-size: 0.75rem;
}

.model-editor-advanced span {
  color: var(--text-tertiary);
  font-size: 0.678571rem;
}

.model-editor-advanced button {
  min-height: 29px;
  padding: 0 10px;
  border: 1px solid var(--theme-line);
  border-radius: 6px;
  background: var(--surface-main);
  color: var(--text-secondary);
  cursor: pointer;
}

.model-editor-advanced button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.model-editor-advanced button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
