<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import { computed, onUnmounted, ref, useId, watch } from "vue";
import AppIcon from "../../components/AppIcon.vue";
import AnalysisProcessPanel from "./AnalysisProcessPanel.vue";
import {
  analysisRunLabels,
  type AnalysisProcessEntry,
  type AnalysisRunState
} from "./analysis-process";
import "./analysis-run-status.css";

const t = createScopedTranslator("extras.analysisUi");

const props = defineProps<{
  status: AnalysisRunState;
  entries: readonly (AnalysisProcessEntry | string)[];
  currentActivity: string;
  liveOutput: string;
  error: string | null;
  title: string;
  progressText?: string;
}>();
const panelId = useId();
const panel = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const now = ref(Date.now());
const busy = computed(() =>
  ["starting", "running", "stopping"].includes(props.status)
);
const statusLabel = computed(() => analysisRunLabels[props.status]);
const activity = computed(() => props.currentActivity || statusLabel.value);
const elapsed = computed(() => {
  const timestamps = props.entries.flatMap((entry) => {
    if (typeof entry === "string" || !entry.createdAt) return [];
    const time = Date.parse(entry.createdAt);
    return Number.isFinite(time) ? [time] : [];
  });
  if (!timestamps.length) return "";
  const end = busy.value ? now.value : timestamps.at(-1)!;
  const seconds = Math.max(0, Math.floor((end - timestamps[0]!) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
});
let timer: ReturnType<typeof setInterval> | undefined;
watch(
  busy,
  (running) => {
    clearInterval(timer);
    now.value = Date.now();
    if (running) timer = setInterval(() => (now.value = Date.now()), 1000);
  },
  { immediate: true }
);
watch(
  () => props.status,
  (status) => {
    if (status === "idle") panel.value?.hidePopover();
  }
);
onUnmounted(() => clearInterval(timer));
function close() {
  panel.value?.hidePopover();
  trigger.value?.focus();
}
function onToggle(event: Event) {
  open.value = (event as ToggleEvent).newState === "open";
}
</script>

<template>
  <div v-if="status !== 'idle'" class="analysis-run-status">
    <button
      ref="trigger"
      type="button"
      class="analysis-status-trigger"
      :class="`is-${status}`"
      :popovertarget="panelId"
      :aria-expanded="open"
      :aria-controls="panelId"
      aria-haspopup="dialog"
      :aria-label="t('viewStatusProcess', { status: statusLabel })"
    >
      <i aria-hidden="true"></i>
      <span class="analysis-status-copy">
        <strong>{{ statusLabel }}</strong>
        <span aria-live="polite">{{ activity }}</span>
      </span>
      <time v-if="elapsed">{{ elapsed }}</time>
      <span class="analysis-status-link"
        >{{ t("viewProcess") }}<AppIcon name="chevron" :size="13"
      /></span>
    </button>
    <section
      :id="panelId"
      ref="panel"
      popover="auto"
      role="dialog"
      :aria-labelledby="`${panelId}-title`"
      class="analysis-process-drawer"
      @toggle="onToggle"
    >
      <header class="analysis-drawer-heading">
        <div>
          <p>{{ title }}</p>
          <h2 :id="`${panelId}-title`">{{ t("process") }}</h2>
        </div>
        <button
          type="button"
          autofocus
          :aria-label="t('closeProcess')"
          @click="close"
        >
          <AppIcon name="close" :size="18" />
        </button>
      </header>
      <div class="analysis-drawer-summary">
        <strong aria-live="polite">{{ activity }}</strong>
        <span v-if="progressText">{{ progressText }}</span>
        <small v-if="elapsed">{{
          t("elapsedIncludingWait", { elapsed: elapsed })
        }}</small>
      </div>
      <AnalysisProcessPanel
        v-if="open"
        :entries="entries"
        :current-activity="activity"
        :live-output="liveOutput"
        :error="error"
        :accessible-label="title"
      />
      <p class="analysis-drawer-hint">
        {{ busy ? t("continuesInBackground") : t("taskEnded") }}
      </p>
    </section>
  </div>
</template>
