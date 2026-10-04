<script setup lang="ts">
import { SUBAGENT_PARALLEL_MAX_CONCURRENCY } from "@deepwrite/contracts/renderer";
import { createScopedTranslator } from "../i18n";
import AgentTeamSwitch from "./AgentTeamSwitch.vue";

const t = createScopedTranslator("components.agentTeamParallelSwitch");

const enabled = defineModel<boolean>({ required: true });
defineProps<{ disabled: boolean }>();
</script>

<template>
  <section class="team-settings" :aria-label="t('teamSettings')">
    <h3>{{ t("teamSettings") }}</h3>
    <label class="parallel-row" :class="{ 'is-disabled': disabled }">
      <span class="parallel-text">
        <strong>{{ t("title") }}</strong>
        <span>{{
          t("description", { arg0: SUBAGENT_PARALLEL_MAX_CONCURRENCY })
        }}</span>
        <span>{{ t("detail") }}</span>
      </span>
      <AgentTeamSwitch v-model="enabled" :disabled="disabled" />
    </label>
  </section>
</template>

<style scoped>
.team-settings {
  padding: 14px 16px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
}
.team-settings h3 {
  margin: 0 0 10px;
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  font-weight: 650;
  letter-spacing: 0.04em;
}
.parallel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  cursor: pointer;
}
.parallel-row.is-disabled {
  cursor: default;
  opacity: 0.65;
}
.parallel-text {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.parallel-text strong {
  color: var(--text-primary);
  font-size: 0.928571rem;
  font-weight: 650;
}
.parallel-text span {
  color: var(--text-secondary);
  font-size: 0.821429rem;
  line-height: 1.55;
}
.parallel-text span + span {
  color: var(--text-tertiary);
}
</style>
