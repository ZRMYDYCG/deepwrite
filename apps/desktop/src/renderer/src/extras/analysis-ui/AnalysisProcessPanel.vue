<script setup lang="ts">
import { createScopedTranslator, locale } from "../../i18n";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { AnalysisProcessEntry } from "./analysis-process";

const t = createScopedTranslator("extras.analysisUi");

const props = defineProps<{
  entries: readonly (AnalysisProcessEntry | string)[];
  currentActivity: string;
  liveOutput: string;
  error: string | null;
  footerText?: string;
  accessibleLabel?: string;
}>();

const displayEntries = computed(() =>
  props.entries.map((entry, index) =>
    typeof entry === "string"
      ? {
          id: String(index),
          title: entry,
          tone: "info",
          createdAt: null,
          detail: null
        }
      : entry
  )
);
const logElement = ref<HTMLElement | null>(null);
const followLatest = ref(true);
function trackScroll(): void {
  const element = logElement.value;
  if (element)
    followLatest.value =
      element.scrollHeight - element.scrollTop - element.clientHeight < 48;
}

function timeLabel(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat(locale.value, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

async function scrollToLatest(): Promise<void> {
  await nextTick();
  const element = logElement.value;
  if (element && followLatest.value) element.scrollTop = element.scrollHeight;
}

watch(
  () => [props.entries.at(-1), props.liveOutput] as const,
  () => void scrollToLatest(),
  { flush: "post" }
);
onMounted(() => void scrollToLatest());
</script>

<template>
  <section
    class="analysis-process-panel"
    :aria-label="accessibleLabel ?? t('agentProcess')"
  >
    <header>
      <strong>{{ t("activityLog") }}</strong>
      <small>{{ t("recordCount", { count: entries.length }) }}</small>
    </header>
    <div
      ref="logElement"
      class="analysis-process-log"
      role="log"
      @scroll="trackScroll"
    >
      <ol v-if="entries.length">
        <li
          v-for="entry in displayEntries"
          :key="entry.id"
          :class="`is-${entry.tone}`"
        >
          <i aria-hidden="true"></i>
          <div>
            <div class="analysis-process-entry-heading">
              <strong>{{ entry.title }}</strong>
              <time v-if="entry.createdAt" :datetime="entry.createdAt">{{
                timeLabel(entry.createdAt)
              }}</time>
            </div>
            <p v-if="entry.detail">{{ entry.detail }}</p>
          </div>
        </li>
      </ol>
      <p v-else class="analysis-process-empty">
        {{ t("progressPlaceholder") }}
      </p>
      <div v-if="liveOutput.trim()" class="analysis-process-output">
        <strong>{{ t("modelOutput") }}</strong>
        <pre>{{ liveOutput }}</pre>
      </div>
    </div>
    <p v-if="error" class="analysis-process-error">{{ error }}</p>
    <footer>
      {{ footerText ?? t("publicOutputOnly") }}
    </footer>
  </section>
</template>

<style scoped>
.analysis-process-panel {
  display: grid;
  gap: 10px;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
}
.analysis-process-panel > header,
.analysis-process-panel > header > div,
.analysis-process-entry-heading {
  display: flex;
  align-items: baseline;
  gap: 9px;
}
.analysis-process-panel > header {
  justify-content: space-between;
}
.analysis-process-panel > header span,
.analysis-process-panel > header small,
.analysis-process-entry-heading span,
.analysis-process-entry-heading time,
.analysis-process-panel > footer {
  color: var(--text-tertiary);
  font-size: 0.75rem;
}
.analysis-process-log {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--theme-line-soft);
  border-radius: 9px;
  background: var(--surface-muted);
}
.analysis-process-log ol {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 4px 12px;
  list-style: none;
}
.analysis-process-log li {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--theme-line-soft);
}
.analysis-process-log li:last-child {
  border-bottom: 0;
}
.analysis-process-log li > i {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--text-tertiary);
}
.analysis-process-log li.is-success > i {
  background: var(--success);
}
.analysis-process-log li.is-error > i {
  background: var(--danger);
}
.analysis-process-entry-heading {
  min-width: 0;
  flex-wrap: wrap;
}
.analysis-process-entry-heading strong {
  min-width: 0;
  overflow-wrap: anywhere;
}
.analysis-process-entry-heading span,
.analysis-process-entry-heading time {
  flex: 0 0 auto;
}
.analysis-process-log li p,
.analysis-process-empty,
.analysis-process-error {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: var(--text-secondary);
  font-size: 0.785714rem;
  line-height: 1.5;
}
.analysis-process-empty {
  padding: 18px;
  text-align: center;
}
.analysis-process-output {
  margin: 0 12px 12px;
  padding: 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-raised);
}
.analysis-process-output > strong {
  font-size: 0.75rem;
}
.analysis-process-output pre {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.785714rem;
  line-height: 1.55;
  white-space: pre-wrap;
}
.analysis-process-error {
  color: var(--danger);
}
.analysis-process-panel > footer {
  margin: 0;
}
@media (max-width: 700px) {
  .analysis-process-panel > header,
  .analysis-process-panel > header > div,
  .analysis-process-entry-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
}
</style>
