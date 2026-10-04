<script setup lang="ts">
import type { SubagentAgentMode } from "@deepwrite/contracts/renderer";
import { createScopedTranslator } from "../i18n";
import AgentTeamSegmented from "./AgentTeamSegmented.vue";
import { SUBAGENT_AGENT_MODE_LABELS } from "./agentTeamSettingsMeta";

const t = createScopedTranslator("components.subagentModeField");

const AGENT_MODES = [
  "standard",
  "pure-read",
  "pure-bare"
] as const satisfies readonly SubagentAgentMode[];

const mode = defineModel<SubagentAgentMode>({ required: true });
defineProps<{ name: string; disabled: boolean }>();

function modeOptions(): { value: SubagentAgentMode; label: string }[] {
  return AGENT_MODES.map((value) => ({
    value,
    label: SUBAGENT_AGENT_MODE_LABELS[value]
  }));
}

function modeHint(value: SubagentAgentMode): string {
  if (value === "pure-read") return t("pureReadHint");
  if (value === "pure-bare") return t("pureBareHint");
  return t("standardHint");
}
</script>

<template>
  <div class="mode-field">
    <span class="mode-field-label">{{ t("runMode") }}</span>
    <AgentTeamSegmented
      v-model="mode"
      :options="modeOptions()"
      :name="name"
      :label="t('subagentRunMode')"
      :disabled="disabled"
    />
    <p class="mode-hint">{{ modeHint(mode) }}</p>
  </div>
</template>

<style scoped>
.mode-field {
  display: grid;
  justify-items: start;
  gap: 6px;
}
.mode-field-label {
  color: var(--text-secondary);
  font-size: 0.821429rem;
  font-weight: 620;
}
.mode-hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  line-height: 1.5;
}
</style>
