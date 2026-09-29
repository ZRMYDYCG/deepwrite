<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import type {
  AgentActivityItem,
  AgentActivityStatus
} from "../types/agentActivity";

const t = createScopedTranslator("components.agentActivityFloatPanel");

const props = defineProps<{
  items: readonly AgentActivityItem[];
}>();

const emit = defineEmits<{
  select: [conversationKey: string];
}>();

const runningCount = computed(
  () => props.items.filter(({ status }) => status === "running").length
);

const statusLabels: Record<AgentActivityStatus, string> = {
  get running() {
    return t("running");
  },
  get completed() {
    return t("completedAwaitingReview");
  },
  get error() {
    return t("failedAwaitingReview");
  },
  get stopped() {
    return t("stoppedAwaitingReview");
  }
};
</script>

<template>
  <section
    class="agent-activity-panel"
    :aria-label="t('agentActivityList')"
    aria-live="polite"
  >
    <header class="agent-activity-panel-header">
      <strong>{{ t("agentActivity") }}</strong>
      <span>{{
        runningCount
          ? runningCount + t("runningLabel")
          : items.length
            ? t("awaitingReview")
            : t("noActivity")
      }}</span>
    </header>
    <ul v-if="items.length" class="agent-activity-list">
      <li v-for="item in items" :key="item.conversationKey">
        <button
          class="agent-activity-item"
          type="button"
          :aria-label="`${item.contextLabel}，${item.agentLabel}，${statusLabels[item.status]}`"
          @click="emit('select', item.conversationKey)"
        >
          <span class="agent-activity-copy">
            <strong>{{ item.contextLabel }}</strong>
            <small>{{ item.agentLabel }}</small>
          </span>
          <span
            class="agent-activity-status"
            :class="`is-${item.status}`"
            :title="statusLabels[item.status]"
          >
            <span
              v-if="item.status === 'running'"
              class="agent-activity-spinner"
              aria-hidden="true"
            />
            <span v-else class="agent-activity-dot" aria-hidden="true" />
            <span class="agent-activity-visually-hidden">{{
              statusLabels[item.status]
            }}</span>
          </span>
        </button>
      </li>
    </ul>
    <div v-else class="agent-activity-empty">
      <strong>{{ t("noAgentsAreRunning") }}</strong>
      <span>{{ t("startATaskToViewAndSwitchBetweenAgents") }}</span>
    </div>
  </section>
</template>
