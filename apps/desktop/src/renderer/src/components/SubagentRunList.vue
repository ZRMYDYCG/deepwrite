<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import type { AgentSubagentRun, ChatMessage } from "../types/conversation";
import SubagentDrawGroup from "./SubagentDrawGroup.vue";
import SubagentRunCard from "./SubagentRunCard.vue";
import {
  subagentDrawGroupStatus,
  subagentRunListEntries
} from "./subagentDrawGroups";

const t = createScopedTranslator("components.subagentRunList");

const props = defineProps<{
  message: ChatMessage;
  runs?: AgentSubagentRun[];
}>();

const runs = computed(() => props.runs ?? props.message.subagentRuns ?? []);
// A draw-mode task shows its candidates and evaluator as one card.
const entries = computed(() =>
  subagentRunListEntries(runs.value, props.message.subagentDraws)
);

/** Counts shown above a multi-task delegation; a draw counts as one task. */
const batchSummary = computed(() => {
  if (entries.value.length < 2 || !runs.value.some((run) => run.batchTask)) {
    return undefined;
  }
  const statuses = entries.value.map((entry) =>
    entry.kind === "run"
      ? entry.run.status
      : subagentDrawGroupStatus(entry.group)
  );
  const running = statuses.filter((status) => status === "running").length;
  const queued = statuses.filter((status) => status === "queued").length;
  const finished = statuses.length - running - queued;
  return [
    t("batchSummary", { arg0: statuses.length }),
    ...(running ? [t("batchActive", { arg0: running })] : []),
    ...(queued ? [t("batchQueued", { arg0: queued })] : []),
    ...(finished ? [t("batchFinished", { arg0: finished })] : [])
  ].join(" · ");
});
</script>

<template>
  <section
    v-if="runs.length"
    class="subagent-run-list"
    :aria-label="t('subagentRuns')"
  >
    <p v-if="batchSummary" class="subagent-batch-summary">
      {{ batchSummary }}
    </p>
    <template v-for="entry in entries" :key="entry.key">
      <SubagentDrawGroup
        v-if="entry.kind === 'draw'"
        :message="message"
        :group="entry.group"
      />
      <SubagentRunCard v-else :message="message" :run="entry.run" />
    </template>
  </section>
</template>

<style scoped>
.subagent-batch-summary {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.75rem;
  line-height: 1.4;
}
</style>
