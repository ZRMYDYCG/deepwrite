<script setup lang="ts">
import { computed } from "vue";
import type {
  AgentActivityItem,
  AgentActivityStatus
} from "../types/agentActivity";

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
  running: "执行中",
  completed: "已完成，等待查看",
  error: "执行失败，等待查看",
  stopped: "已停止，等待查看"
};
</script>

<template>
  <section
    class="agent-activity-panel"
    aria-label="智能体执行列表"
    aria-live="polite"
  >
    <header class="agent-activity-panel-header">
      <strong>智能体执行</strong>
      <span>{{
        runningCount
          ? runningCount + " 个执行中"
          : items.length
            ? "等待查看"
            : "暂无活动"
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
      <strong>暂无运行中的智能体</strong>
      <span>启动任务后，可在这里查看和切换。</span>
    </div>
  </section>
</template>
