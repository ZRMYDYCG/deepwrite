<script setup lang="ts">
import { computed } from "vue";
import type { ChatContextCompaction } from "../types/conversation";
import { formatContextTokens } from "../utils/contextWindowUsage";
import ConversationDetails from "./ConversationDetails.vue";

const props = defineProps<{ compactions: readonly ChatContextCompaction[] }>();

const REASON_LABELS: Record<ChatContextCompaction["reason"], string> = {
  threshold: "上下文接近工作预算",
  overflow: "模型提示上下文过长",
  manual: "手动压缩",
  idle: "为下一轮整理上下文",
  run_limit: "本轮工作过长"
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
  return `约 ${formatContextTokens(item.tokensBefore)} → ${formatContextTokens(
    item.tokensAfter
  )} tokens`;
}

function title(item: ChatContextCompaction): string {
  if (item.status === "running") return "正在整理较早的对话…";
  if (item.status === "failed") return "上下文压缩未完成，本轮使用完整上下文";
  if (item.level === "summary") return "较早的对话已压缩为检查点";
  if (item.reason === "manual") return "对话较短，已精简旧工具结果";
  return "已精简旧的读取结果与工作区快照";
}
</script>

<template>
  <div
    v-if="visible.length"
    class="context-compaction-notices"
    aria-label="上下文压缩"
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
            · 查看摘要
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
