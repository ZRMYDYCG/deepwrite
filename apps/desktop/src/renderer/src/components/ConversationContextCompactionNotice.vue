<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import type { ChatContextCompaction } from "../types/conversation";
import { formatContextTokens } from "../utils/contextWindowUsage";
import ConversationDetails from "./ConversationDetails.vue";

const t = createScopedTranslator(
  "components.conversationContextCompactionNotice"
);

const props = defineProps<{ compactions: readonly ChatContextCompaction[] }>();

const REASON_LABELS: Record<ChatContextCompaction["reason"], string> = {
  get threshold() {
    return t("contextIsApproachingTheWorkingBudget");
  },
  get overflow() {
    return t("theModelReportedExcessiveContextLength");
  },
  get manual() {
    return t("manualCompaction");
  },
  get idle() {
    return t("prepareContextForTheNextTurn");
  },
  get run_limit() {
    return t("thisTurnHasBecomeTooLong");
  }
};

/** Prune-only passes that changed nothing are not worth a divider. */
const visible = computed(() =>
  props.compactions.filter(
    (item) =>
      item.status !== "failed" &&
      (item.status !== "completed" ||
        item.level === "summary" ||
        (item.tokensBefore ?? 0) > (item.tokensAfter ?? 0))
  )
);

function tokens(item: ChatContextCompaction): string {
  if (item.tokensBefore === undefined || item.tokensAfter === undefined) {
    return "";
  }
  return t("aboutValueValueTokens", {
    arg0: formatContextTokens(item.tokensBefore),
    arg1: formatContextTokens(item.tokensAfter)
  });
}

function title(item: ChatContextCompaction): string {
  if (item.status === "running") return t("summarizingEarlierMessages");
  if (item.status === "failed")
    return t("contextCompactionDidNotFinishUsingFullContextFor");
  if (item.level === "summary")
    return t("earlierMessagesHaveBeenSummarizedIntoACheckpoint");
  if (item.reason === "manual")
    return t("conversationIsShortOldToolResultsWereTrimmed");
  return t("oldReadResultsAndWorkspaceSnapshotsWereTrimmed");
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
          <span class="context-compaction-meta">
            {{ REASON_LABELS[item.reason] }}
            <template v-if="tokens(item)"> · {{ tokens(item) }}</template>
            {{ t("viewSummary") }}
          </span>
        </template>
        <pre class="context-compaction-summary">{{
          item.checkpoint.summary
        }}</pre>
      </ConversationDetails>
      <p v-else class="context-compaction-line">
        <span class="context-compaction-title">{{ title(item) }}</span>
        <span class="context-compaction-meta">
          {{ REASON_LABELS[item.reason] }}
          <template v-if="tokens(item)"> · {{ tokens(item) }}</template>
          <template v-if="item.errorMessage">
            · {{ item.errorMessage }}</template
          >
        </span>
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
