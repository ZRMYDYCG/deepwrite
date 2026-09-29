<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import { computed, ref, watch } from "vue";
import AppIcon from "../../components/AppIcon.vue";
import type { ConversationHistoryItem } from "../../types/conversation";

const t = createScopedTranslator("extras.chatAssistant");

const props = defineProps<{
  history: readonly ConversationHistoryItem[];
  emptyHint: string;
}>();

const emit = defineEmits<{
  selectConversation: [sessionId: string];
}>();

const showAllHistory = ref(false);
const visibleHistory = computed(() =>
  showAllHistory.value ? props.history : props.history.slice(0, 3)
);
const currentSessionId = computed(
  () => props.history.find((item) => item.current)?.sessionId
);

watch(currentSessionId, () => {
  showAllHistory.value = false;
});

function formatHistoryTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const elapsedDays = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (elapsedDays <= 0) return t("today");
  return t("daysAgo", { count: elapsedDays });
}

function selectConversation(sessionId: string): void {
  showAllHistory.value = false;
  emit("selectConversation", sessionId);
}
</script>

<template>
  <section
    class="chat-assistant-home"
    :class="history.length ? 'has-history' : 'is-empty'"
  >
    <template v-if="history.length">
      <div class="chat-assistant-home-spacer" />
      <div class="chat-assistant-recent">
        <span>{{ t("recentChats") }}</span>
        <button
          v-for="item in visibleHistory"
          :key="item.sessionId"
          type="button"
          @click="selectConversation(item.sessionId)"
        >
          <strong>{{ item.title }}</strong>
          <time :datetime="item.updatedAt">
            {{ formatHistoryTime(item.updatedAt) }}
          </time>
        </button>
        <button
          v-if="history.length > 3 && !showAllHistory"
          class="chat-assistant-view-all"
          type="button"
          @click="showAllHistory = true"
        >
          {{ t("viewAll") }}
        </button>
      </div>
    </template>
    <div v-else class="chat-assistant-empty">
      <AppIcon name="message" :size="28" />
      <strong>{{ t("startNewChat") }}</strong>
      <span>{{ emptyHint }}</span>
    </div>
  </section>
</template>

<style scoped>
.chat-assistant-home {
  min-height: 100%;
}
.chat-assistant-home.has-history {
  display: grid;
  grid-template-rows: minmax(80px, 1fr) auto;
}
.chat-assistant-home.is-empty {
  display: grid;
  place-items: center;
}
.chat-assistant-home-spacer {
  min-height: 80px;
}
.chat-assistant-recent {
  display: grid;
  gap: 4px;
  padding-bottom: 20px;
}
.chat-assistant-recent > span {
  margin-bottom: 10px;
  color: var(--text-tertiary);
}
.chat-assistant-recent > button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  width: 100%;
  padding: 10px 0;
  color: var(--text-secondary);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 8px;
}
.chat-assistant-recent > button:hover {
  color: var(--text-primary);
}
.chat-assistant-recent strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.chat-assistant-recent time {
  flex: none;
  color: var(--text-tertiary);
}
.chat-assistant-view-all {
  justify-content: flex-start !important;
  color: var(--text-tertiary) !important;
}
.chat-assistant-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  max-width: 100%;
  color: var(--text-tertiary);
  text-align: center;
}
.chat-assistant-empty strong {
  color: var(--text-secondary);
}
</style>
