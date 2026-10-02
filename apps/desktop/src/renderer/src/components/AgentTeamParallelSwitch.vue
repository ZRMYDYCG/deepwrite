<script setup lang="ts">
import { SUBAGENT_PARALLEL_MAX_CONCURRENCY } from "@deepwrite/contracts/renderer";
import { createScopedTranslator } from "../i18n";

const t = createScopedTranslator("components.agentTeamParallelSwitch");

const enabled = defineModel<boolean>({ required: true });
defineProps<{ disabled: boolean }>();
</script>

<template>
  <label class="parallel-switch" :class="{ 'is-disabled': disabled }">
    <span class="parallel-switch-text">
      <strong>{{ t("title") }}</strong>
      <span>{{
        t("description", { arg0: SUBAGENT_PARALLEL_MAX_CONCURRENCY })
      }}</span>
    </span>
    <input
      v-model="enabled"
      type="checkbox"
      role="switch"
      :aria-checked="enabled"
      :disabled="disabled"
    />
  </label>
</template>

<style scoped>
.parallel-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  background: var(--surface-raised);
  cursor: pointer;
}
.parallel-switch.is-disabled {
  cursor: default;
  opacity: 0.65;
}
.parallel-switch-text {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.parallel-switch-text strong {
  color: var(--text-primary);
  font-size: 0.892857rem;
  font-weight: 650;
}
.parallel-switch-text span {
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  line-height: 1.5;
}
.parallel-switch input {
  position: relative;
  flex: 0 0 auto;
  width: 38px;
  height: 22px;
  margin: 0;
  appearance: none;
  border-radius: 12px;
  background: var(--surface-selected);
  cursor: inherit;
  transition: background-color 150ms ease;
}
.parallel-switch input::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-main);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.22);
  content: "";
  transition: transform 150ms ease;
}
.parallel-switch input:checked {
  background: var(--accent);
}
.parallel-switch input:checked::after {
  transform: translateX(16px);
}
.parallel-switch input:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 2px;
}
</style>
