<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import type { ChatContextCompaction } from "../types/conversation";
import ConversationDetails from "./ConversationDetails.vue";
import { visibleCompaction } from "./conversationCompactionPresentation";

const t = createScopedTranslator(
  "components.conversationContextCompactionNotice"
);

const props = defineProps<{ compactions: readonly ChatContextCompaction[] }>();

const visible = computed(() => props.compactions.filter(visibleCompaction));

function title(item: ChatContextCompaction): string {
  if (item.reason === "manual") {
    if (item.status === "running") return t("manualCompactionInProgress");
    return item.level === "summary" || item.checkpoint
      ? t("manualCompactionCompletedWithSummary")
      : t("manualCompactionCompleted");
  }
  if (item.status === "running") return t("automaticCompactionInProgress");
  if (item.level === "summary" || item.checkpoint)
    return t("automaticCompactionCompletedWithSummary");
  return t("automaticCompactionCompleted");
}
</script>

<template>
  <div
    v-if="visible.length"
    class="context-compaction-notices"
    :aria-label="t('contextCompaction')"
  >
    <div
      v-for="item in visible"
      :key="item.id"
      class="context-compaction-notice"
      :data-status="item.status"
    >
      <ConversationDetails
        v-if="item.checkpoint"
        :detail-id="`context-compaction:${item.id}`"
      >
        <template #summary>
          <span class="context-compaction-title">{{ title(item) }}</span>
          <span class="context-compaction-meta">{{ t("viewSummary") }}</span>
        </template>
        <pre class="context-compaction-summary">{{
          item.checkpoint.summary
        }}</pre>
      </ConversationDetails>
      <p v-else class="context-compaction-line">
        <span class="context-compaction-title">{{ title(item) }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.context-compaction-notices {
  display: grid;
  gap: 6px;
  margin-bottom: 8px;
}

.context-compaction-notice {
  border-top: 1px dashed var(--theme-line-soft);
  padding-top: 6px;
  color: var(--text-secondary);
  font-size: 0.86em;
}

.context-compaction-notice[data-status="failed"] {
  color: var(--text-tertiary);
}

.context-compaction-notice :deep(summary),
.context-compaction-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin: 0;
  cursor: default;
}

.context-compaction-notice :deep(summary) {
  cursor: pointer;
  list-style: none;
}

.context-compaction-notice :deep(summary::-webkit-details-marker) {
  display: none;
}

.context-compaction-title {
  color: var(--text-primary);
}

.context-compaction-notice[data-status="running"] .context-compaction-title {
  color: var(--accent);
}

.context-compaction-meta {
  color: var(--text-tertiary);
}

.context-compaction-summary {
  max-height: 360px;
  overflow: auto;
  margin: 6px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
