<script setup lang="ts">
import { createScopedTranslator, locale } from "../i18n";
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
  type CSSProperties
} from "vue";
import { useCurrentConversationExport } from "../composables/useCurrentConversationExport";
import { useConversationHistoryManagement } from "../composables/useConversationHistoryManagement";
import type { ConversationHistoryItem } from "../types/conversation";
import AppIcon from "./AppIcon.vue";
import { conversationHistoryPosition } from "./conversationHistoryPosition";

const t = createScopedTranslator("components.conversationHistoryMenu");
const props = defineProps<{
  conversationHistory: ConversationHistoryItem[];
  currentSessionId: string;
  responding: boolean;
  bookScoped: boolean;
  compact?: boolean;
}>();
const emit = defineEmits<{ selectConversation: [sessionId: string] }>();
const exportAction = useCurrentConversationExport(() => props.currentSessionId);
const historyOpen = ref(false);
const trigger = ref<HTMLButtonElement>();
const panelStyle = ref<CSSProperties>({ visibility: "hidden" });
let surfaceObserver: ResizeObserver | undefined;
const panelId = useId();
const {
  available: managementAvailable,
  busy,
  archiveConversation
} = useConversationHistoryManagement(() => props.currentSessionId);
function positionPanel(): void {
  if (!historyOpen.value || !trigger.value) return;
  const surface = trigger.value.closest<HTMLElement>(
    ".conversation-pane, .chat-assistant-window"
  );
  if (!surface) return;
  const position = conversationHistoryPosition(
    trigger.value.getBoundingClientRect(),
    surface.getBoundingClientRect(),
    { width: window.innerWidth, height: window.innerHeight }
  );
  panelStyle.value = {
    left: `${position.left}px`,
    top: `${position.top}px`,
    width: `${position.width}px`,
    maxHeight: `${position.maxHeight}px`
  };
}
watch(historyOpen, async (open) => {
  surfaceObserver?.disconnect();
  if (!open) {
    panelStyle.value = { visibility: "hidden" };
    return;
  }
  await nextTick();
  if (!historyOpen.value || !trigger.value) return;
  positionPanel();
  if (typeof ResizeObserver !== "undefined") {
    surfaceObserver = new ResizeObserver(positionPanel);
    const surface = trigger.value.closest<HTMLElement>(
      ".conversation-pane, .chat-assistant-window"
    );
    if (surface) surfaceObserver.observe(surface);
  }
});
onMounted(() => window.addEventListener("resize", positionPanel));
onBeforeUnmount(() => {
  window.removeEventListener("resize", positionPanel);
  surfaceObserver?.disconnect();
});
watch(
  () => props.currentSessionId,
  () => {
    historyOpen.value = false;
  }
);
function formatHistoryTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale.value, {
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  return date.toLocaleDateString(locale.value, {
    month: "numeric",
    day: "numeric"
  });
}

function selectHistoryConversation(item: ConversationHistoryItem): void {
  historyOpen.value = false;
  if (item.sessionId !== props.currentSessionId) {
    emit("selectConversation", item.sessionId);
  }
}
</script>
<template>
  <div
    class="conversation-history-control"
    @keydown.esc.stop="historyOpen = false"
  >
    <button
      ref="trigger"
      class="header-text-button"
      :class="{ 'is-active': historyOpen }"
      type="button"
      aria-haspopup="dialog"
      :aria-expanded="historyOpen"
      :aria-controls="panelId"
      :aria-label="t('conversationHistory')"
      :title="t('conversationHistory')"
      @click="historyOpen = !historyOpen"
    >
      <AppIcon name="history" :size="16" />
      <span v-if="!compact">{{ t("conversationHistory") }}</span>
    </button>
    <div
      v-if="historyOpen"
      class="conversation-history-dismiss"
      aria-hidden="true"
      @mousedown="historyOpen = false"
    />
    <section
      v-if="historyOpen"
      :id="panelId"
      class="conversation-history-panel"
      :style="panelStyle"
      role="dialog"
      :aria-label="t('conversationHistory')"
    >
      <header>
        <div class="conversation-history-heading">
          <strong>{{ t("conversationHistory") }}</strong>
        </div>
        <button
          type="button"
          :aria-label="t('closeConversationHistory')"
          @click="historyOpen = false"
        >
          <AppIcon name="close" :size="15" />
        </button>
      </header>
      <div v-if="conversationHistory.length" class="conversation-history-list">
        <div
          v-for="item in conversationHistory"
          :key="item.sessionId"
          class="conversation-history-row"
        >
          <button
            class="conversation-history-item"
            :class="{ 'is-current': item.current }"
            :aria-current="item.current ? 'true' : undefined"
            :title="
              responding && !item.current
                ? t('switchAfterTheReplyFinishesOrStops')
                : item.title
            "
            type="button"
            :disabled="busy || (responding && !item.current)"
            @click="selectHistoryConversation(item)"
          >
            <span class="conversation-history-copy">
              <span class="conversation-history-title-row">
                <strong>{{ item.title }}</strong>
                <time :datetime="item.updatedAt">{{
                  formatHistoryTime(item.updatedAt)
                }}</time>
              </span>
              <small v-if="item.preview && item.preview !== item.title">{{
                item.preview
              }}</small>
            </span>
          </button>
          <button
            v-if="managementAvailable"
            class="conversation-history-manage"
            type="button"
            :disabled="busy"
            :aria-label="t('archiveConversation', { title: item.title })"
            :title="t('archive')"
            @click="archiveConversation(item)"
          >
            <AppIcon name="archive" :size="15" />
          </button>
        </div>
      </div>
      <div v-else class="conversation-history-empty">
        <AppIcon name="history" :size="22" />
        <strong>{{ t("noConversationHistoryYet") }}</strong>
      </div>
      <div
        v-if="exportAction.available.value"
        class="conversation-history-export"
      >
        <button
          type="button"
          :disabled="exportAction.exporting.value"
          :title="t('includesContentNotYetSavedInThisClient')"
          @click="exportAction.start"
        >
          {{
            exportAction.exporting.value
              ? t("exporting")
              : t("exportCurrentConversation")
          }}
        </button>
        <button
          v-if="exportAction.exporting.value"
          type="button"
          @click="exportAction.cancel"
        >
          {{ t("cancel") }}
        </button>
      </div>
    </section>
  </div>
</template>
<style scoped>
.conversation-history-export {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--theme-line-soft);
}
.conversation-history-export button {
  border: 0;
  border-radius: 6px;
  padding: 6px;
  color: var(--text-secondary);
  background: transparent;
  font: inherit;
  font-size: 0.785714rem;
  cursor: pointer;
}
.conversation-history-export button:hover {
  background: var(--surface-hover);
}
.conversation-history-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}
.conversation-history-manage {
  min-width: 2rem;
  min-height: 2rem;
  margin-right: 5px;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  color: var(--text-secondary);
  background: transparent;
  font: inherit;
  font-size: 0.785714rem;
  cursor: pointer;
}
.conversation-history-manage:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.conversation-history-manage:disabled {
  opacity: 0.45;
  cursor: default;
}
.conversation-history-manage:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
