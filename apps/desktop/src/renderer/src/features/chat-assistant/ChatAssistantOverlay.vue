<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from "vue";
import type {
  CatalogIndexSnapshot,
  LongBookSummary
} from "@deepwrite/contracts";
import ChatAssistantProjectConfig from "./ChatAssistantProjectConfig.vue";
import ChatAssistantRoleplayConfig from "./ChatAssistantRoleplayConfig.vue";
import { useChatAssistantWindow } from "./useChatAssistantWindow";
import { projectTypeLabels } from "./chatAssistantProjectOptions";
import type { AgentConversationController } from "../../composables/useAgentConversation";
import { useConversationScrollFollow } from "../../composables/useConversationScrollFollow";
import { uiMessage } from "../../ui-feedback";
import { lastAssistantMessage as findLastAssistantMessage } from "../../utils/conversationMessageLookup";
import ConversationMessageList from "../../components/ConversationMessageList.vue";
import type {
  PopupSelectOption,
  PopupSelectValue
} from "../../components/PopupSelect.vue";
import ChatAssistantHeader from "./ChatAssistantHeader.vue";
import ChatAssistantHome from "./ChatAssistantHome.vue";
import ChatAssistantComposer from "./ChatAssistantComposer.vue";
import { useChatAssistantMode } from "./useChatAssistantMode";
import { useChatAssistantHistoryActions } from "./useChatAssistantHistoryActions";
import { useChatAssistantWebSearch } from "./useChatAssistantWebSearch";

const props = defineProps<{
  active: boolean;
  conversationForKey(key: string, scope?: string): AgentConversationController;
  catalogSnapshot: CatalogIndexSnapshot | null;
  longBooks: readonly LongBookSummary[];
  runtimeAvailable: boolean;
}>();

const emit = defineEmits<{ minimize: [] }>();
const assistant = useChatAssistantMode({
  conversationForKey: props.conversationForKey,
  catalogSnapshot: toRef(props, "catalogSnapshot"),
  longBooks: toRef(props, "longBooks")
});
const controller = assistant.controller;
const composer = ref<{ focus(): void } | null>(null);
const projectConfig = ref<InstanceType<
  typeof ChatAssistantProjectConfig
> | null>(null);
const roleplayConfig = ref<InstanceType<
  typeof ChatAssistantRoleplayConfig
> | null>(null);
const { windowStyle, startResize, handleResizeKeydown } =
  useChatAssistantWindow();
const messages = computed(() => controller.value!.messages.value);
const { scroller, handleConversationWheel, handleConversationScroll } =
  useConversationScrollFollow({
    messages: () => messages.value,
    responding: () => controller.value!.isBusy.value,
    currentSessionId: () => controller.value!.sessionId.value
  });
const history = computed(() => controller.value!.history.value);
const currentHistory = computed(() =>
  history.value.find((item) => item.current)
);
const title = computed(() => currentHistory.value?.title || "新聊天");
const lastAssistantMessage = computed(() =>
  findLastAssistantMessage(messages.value, true)
);
const selectedModel = computed(() =>
  controller.value!.configuredModels.value.find(
    (model) => model.id === controller.value!.selectedModelId.value
  )
);
const webSearch = useChatAssistantWebSearch({
  selectedModel,
  onAutomaticallyDisabled: () => {
    uiMessage.info(
      "智能搜索已关闭：仅 DeepSeek 的 Responses 或 Anthropic API 模型支持此功能"
    );
  }
});
const webSearchDisabledReason =
  "仅支持 Provider 为 DeepSeek，且 API 类型为 OpenAI Responses 或 Anthropic Messages 的模型";
const modelOptions = computed(() =>
  controller.value!.configuredModels.value.map((model) => ({
    value: model.id,
    label: model.label,
    ...(model.id === controller.value!.selectedModelId.value
      ? { description: "当前模型" }
      : {})
  }))
);
const thinkingLabels: Record<string, string> = {
  off: "关闭",
  minimal: "最低",
  low: "较低",
  medium: "标准",
  high: "深度",
  xhigh: "极高",
  max: "最高"
};
const thinkingOptions = computed(() => [
  { value: "off", label: "关闭" },
  ...(
    selectedModel.value?.thinkingLevelOptions ?? [
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]
  ).map((value) => ({ value, label: thinkingLabels[value] ?? value }))
]);
const canSend = computed(() => controller.value!.canSend.value);
const canStop = computed(() => controller.value!.canStop.value);
const effectiveCanSend = computed(
  () => canSend.value && assistant.chatTask.value !== null
);
const activeContextKey = computed(() =>
  assistant.mode.value === "normal"
    ? "context:normal"
    : assistant.mode.value === "roleplay"
      ? `context:roleplay:${assistant.selectedRoleId.value}`
      : `context:project:${assistant.selectedProjectKey.value}`
);
const contextOptions = computed<PopupSelectOption[]>(() => {
  const options: PopupSelectOption[] = [
    { value: "context:normal", label: "普通模式" },
    { value: "context:add-roleplay", label: "+ 添加新扮演配置" },
    ...assistant.roleplays.value.map((role) => ({
      value: `context:roleplay:${role.id}`,
      label: role.name,
      description: "人物扮演",
      actionIcon: "edit" as const,
      actionLabel: `编辑人物：${role.name}`
    }))
  ];
  if (assistant.configuredProjectOptions.value.length) {
    options.push({
      value: "context:projects",
      label: "项目",
      disabled: true,
      style: { fontWeight: "600", color: "var(--text-tertiary)" }
    });
    options.push(
      ...assistant.configuredProjectOptions.value.map((option) => ({
        value: `context:project:${option.key}`,
        label: option.label,
        description: option.available
          ? projectTypeLabels[option.project.projectType]
          : "关联书籍不可用",
        ...(option.available
          ? {
              actionIcon: "edit" as const,
              actionLabel: `编辑项目：${option.label}`
            }
          : {}),
        style: { paddingLeft: "22px" }
      }))
    );
  }
  options.push({
    value: "context:add-project",
    label: "+ 添加新项目配置"
  });
  return options;
});
const emptyHint = computed(() => {
  if (assistant.mode.value === "roleplay")
    return assistant.selectedRole.value
      ? `正在与${assistant.selectedRole.value.name}聊天，仅使用人物定义和当前聊天记录。`
      : "请添加或选择人物配置后开始聊天。";
  if (assistant.mode.value === "normal") {
    return "可查询创作空间目录、资料库、技能库、模型配置和用量，不读取正文。";
  }
  if (!assistant.selectedProject.value)
    return "请添加项目并关联一本书籍后开始聊天。";
  if (!assistant.projectAvailable.value)
    return "所选项目已不存在或暂时不可用，当前无法发送。";
  return `当前只读查询：${assistant.selectedProjectOption.value?.label ?? "所选项目"}`;
});

function focusInput(): void {
  void nextTick(() => composer.value?.focus());
}

function setConversationScroller(element: unknown): void {
  scroller.value = element instanceof HTMLElement ? element : undefined;
}

async function send(): Promise<void> {
  if (!effectiveCanSend.value) return;
  await assistant.sendAssistantMessage(
    webSearch.enabled.value && webSearch.available.value
  );
}

function updateContext(value: PopupSelectValue): void {
  const key = String(value);
  if (key === "context:add-roleplay") {
    roleplayConfig.value?.open();
    return;
  }
  if (key.startsWith("context:roleplay:")) {
    assistant.selectRole(key.slice("context:roleplay:".length));
    return;
  }
  if (key === "context:add-project") {
    projectConfig.value?.openAddProject();
    return;
  }
  if (key === "context:normal") {
    if (!assistant.setMode("normal")) {
      uiMessage.info("当前回复完成或停止后，才能切换聊天上下文");
    }
    return;
  }
  const prefix = "context:project:";
  if (!key.startsWith(prefix)) return;
  const projectKey = key.slice(prefix.length);
  if (!assistant.selectProject(projectKey) || !assistant.setMode("project")) {
    uiMessage.info("当前回复完成或停止后，才能切换聊天上下文");
  }
}

function editContext(value: PopupSelectValue): void {
  const key = String(value);
  if (key.startsWith("context:roleplay:")) {
    const role = assistant.roleplays.value.find(
      (item) => item.id === key.slice("context:roleplay:".length)
    );
    if (role) roleplayConfig.value?.open(role);
  } else {
    void projectConfig.value?.openEditProject(value);
  }
}

const { newConversation, selectConversation } = useChatAssistantHistoryActions({
  controller: () => controller.value!,
  focusInput
});

async function copyLastReply(): Promise<void> {
  const content = lastAssistantMessage.value?.content.trim();
  if (!content) return;
  try {
    await navigator.clipboard.writeText(content);
    uiMessage.success("已复制最后一条回复");
  } catch {
    uiMessage.error("复制失败，请稍后重试");
  }
}

watch(
  () => props.active,
  (active) => {
    if (active) focusInput();
  },
  { immediate: true }
);
watch(
  () => controller.value!.conversationError.value,
  (message) => {
    if (message) uiMessage.error(message);
  }
);
watch(
  () => assistant.projectAvailable.value,
  (available, previous) => {
    if (previous && !available && assistant.mode.value === "project") {
      uiMessage.error("所选项目已删除或不可用，请重新选择项目");
    }
  }
);
</script>

<template>
  <section
    class="chat-assistant-window"
    :style="windowStyle"
    role="dialog"
    aria-modal="false"
    aria-label="独立聊天助手"
    @keydown.esc.stop.prevent="emit('minimize')"
  >
    <div
      class="chat-assistant-resize-edge is-left"
      role="separator"
      aria-label="调整聊天窗口宽度"
      aria-orientation="vertical"
      tabindex="0"
      @pointerdown="startResize($event, 'width')"
      @keydown="handleResizeKeydown($event, 'width')"
    />
    <div
      class="chat-assistant-resize-edge is-top"
      role="separator"
      aria-label="调整聊天窗口高度"
      aria-orientation="horizontal"
      tabindex="0"
      @pointerdown="startResize($event, 'height')"
      @keydown="handleResizeKeydown($event, 'height')"
    />
    <div
      class="chat-assistant-resize-edge is-top-left"
      role="separator"
      aria-label="同时调整聊天窗口宽高"
      tabindex="0"
      @pointerdown="startResize($event, 'both')"
      @keydown="handleResizeKeydown($event, 'both')"
    />
    <ChatAssistantHeader
      :title="title"
      :active-context-key="activeContextKey"
      :context-options="contextOptions"
      :context-disabled="
        assistant.isBusy.value ||
        Boolean(projectConfig?.pending) ||
        Boolean(roleplayConfig?.pending)
      "
      :history="history"
      :session-id="controller.sessionId.value"
      :busy="controller.isBusy.value"
      :can-copy="Boolean(lastAssistantMessage)"
      @update-context="updateContext"
      @edit-project="editContext"
      @select-conversation="selectConversation"
      @new-conversation="newConversation"
      @copy-last-reply="copyLastReply"
      @minimize="emit('minimize')"
    />

    <ConversationMessageList
      class="chat-assistant-content"
      :messages="messages"
      :responding="controller.isBusy.value"
      :runtime-available="runtimeAvailable"
      :set-scroller="setConversationScroller"
      :handle-conversation-wheel="handleConversationWheel"
      :handle-conversation-scroll="handleConversationScroll"
    >
      <template #empty>
        <div class="chat-assistant-home-wrap">
          <ChatAssistantHome
            :history="history"
            :empty-hint="emptyHint"
            @select-conversation="selectConversation"
          />
        </div>
      </template>
    </ConversationMessageList>

    <ChatAssistantComposer
      ref="composer"
      :session-id="controller.sessionId.value"
      :has-history="controller.messages.value.length > 0"
      :draft="controller.draft.value"
      :runtime-available="runtimeAvailable"
      :busy="controller.isBusy.value"
      :can-send="effectiveCanSend"
      :can-stop="canStop"
      :selected-model-id="controller.selectedModelId.value"
      :model-options="modelOptions"
      :thinking-level="controller.thinkingLevel.value"
      :thinking-options="thinkingOptions"
      :web-search-visible="assistant.mode.value !== 'roleplay'"
      :web-search-enabled="
        assistant.mode.value !== 'roleplay' && webSearch.enabled.value
      "
      :web-search-available="webSearch.available.value"
      :web-search-disabled-reason="webSearchDisabledReason"
      @update:draft="controller.draft.value = $event"
      @send="send"
      @stop="controller.stopGeneration()"
      @select-model="controller.selectModel($event)"
      @select-thinking="controller.selectThinkingLevel($event)"
      @toggle-web-search="webSearch.setEnabled($event)"
    />

    <ChatAssistantProjectConfig ref="projectConfig" :assistant="assistant" />
    <ChatAssistantRoleplayConfig ref="roleplayConfig" :assistant="assistant" />
  </section>
</template>

<style scoped>
.chat-assistant-window {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 90;
  width: min(44vw, calc(100vw - 40px));
  min-width: 480px;
  max-width: calc(100vw - 40px);
  height: min(88vh, calc(100vh - 40px));
  min-height: 420px;
  max-height: calc(100vh - 40px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--surface-main);
  border: 1px solid var(--theme-line);
  border-radius: 28px;
  box-shadow: 0 24px 70px color-mix(in srgb, #000 20%, transparent);
}
.chat-assistant-resize-edge {
  position: absolute;
  z-index: 3;
  outline: 0;
}
.chat-assistant-resize-edge.is-left {
  top: 20px;
  bottom: 20px;
  left: 0;
  width: 8px;
  cursor: ew-resize;
}
.chat-assistant-resize-edge.is-top {
  top: 0;
  right: 20px;
  left: 20px;
  height: 8px;
  cursor: ns-resize;
}
.chat-assistant-resize-edge.is-top-left {
  top: 0;
  left: 0;
  z-index: 4;
  width: 24px;
  height: 24px;
  cursor: nwse-resize;
}
.chat-assistant-resize-edge:focus-visible {
  background: var(--accent-soft);
}
.chat-assistant-content {
  min-height: 0;
  padding: 0;
}
.chat-assistant-content :deep(.message-list) {
  width: min(720px, calc(100% - 36px));
  padding: 28px 0 48px;
}
.chat-assistant-home-wrap {
  display: grid;
  width: min(720px, calc(100% - 60px));
  height: 100%;
  min-height: 100%;
  margin: 0 auto;
  padding: 22px 0;
  box-sizing: border-box;
}
@media (max-width: 760px) {
  .chat-assistant-window {
    inset: 12px;
    width: auto;
    min-width: 0;
    max-width: none;
    height: auto;
    min-height: 0;
    max-height: none;
    border-radius: 22px;
  }
  .chat-assistant-resize-edge {
    display: none;
  }
  .chat-assistant-content :deep(.message-list),
  .chat-assistant-home-wrap {
    width: calc(100% - 32px);
  }
}
</style>
