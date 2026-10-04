<script setup lang="ts">
import type { SubagentAuthoringOutputMode } from "@deepwrite/contracts/renderer";
import { createScopedTranslator } from "../i18n";

const t = createScopedTranslator("components.subagentAuthoringOutputModeField");

const mode = defineModel<SubagentAuthoringOutputMode>({ required: true });
defineProps<{ name: string; disabled: boolean }>();

const MODES = ["write", "handoff"] as const;
</script>

<template>
  <div class="output-modes" role="radiogroup" :aria-label="t('outputMethod')">
    <label
      v-for="option in MODES"
      :key="option"
      :class="{ 'is-selected': mode === option }"
    >
      <input
        v-model="mode"
        type="radio"
        :name="name"
        :value="option"
        :disabled="disabled"
      />
      <span>
        <strong>{{
          option === "write" ? t("writeDocuments") : t("returnConclusions")
        }}</strong>
        <em>{{
          option === "write"
            ? t("writeDocumentsHint")
            : t("returnConclusionsHint")
        }}</em>
      </span>
    </label>
  </div>
</template>

<style scoped>
.output-modes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
.output-modes label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  background: var(--surface-main);
  cursor: pointer;
}
.output-modes label:hover {
  background: var(--surface-hover);
}
.output-modes label.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.output-modes label:has(input:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 1px;
}
.output-modes label:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.6;
}
.output-modes input {
  flex: none;
  margin: 3px 0 0;
  accent-color: var(--accent);
}
.output-modes span {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.output-modes strong {
  color: var(--text-primary);
  font-size: 0.857143rem;
  font-weight: 650;
}
.output-modes em {
  color: var(--text-secondary);
  font-size: 0.785714rem;
  font-style: normal;
  line-height: 1.5;
}
</style>
