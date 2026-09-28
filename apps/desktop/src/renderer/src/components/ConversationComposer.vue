<script setup lang="ts">
import type {
  AgentTeamRunMode,
  LibraryAgentDomain,
  LongAgentId,
  ModelConfig,
  ThinkingLevel,
  UserPromptAttachment,
  WorkspaceAgentId
} from "@deepwrite/contracts";
import type {
  AgentApprovalMode,
  ChatMessage,
  ComposerReferenceOption,
  EditorTextReference
} from "../types/conversation";
import type { IconName } from "../types/workspace";
import { PROMPT_ATTACHMENT_ACCEPT } from "../utils/promptAttachments";
import {
  useConversationAttachments,
  attachmentPreview,
  formatFileSize
} from "../composables/useConversationAttachments";
import { useConversationComposer } from "../composables/useConversationComposer";
import { useSettingsStore } from "../stores/settingsStore";
import AppIcon from "./AppIcon.vue";
import AgentTeamModeSelect from "./AgentTeamModeSelect.vue";
import ContextCompactionButton from "./ContextCompactionButton.vue";
import ContextWindowIndicator from "./ContextWindowIndicator.vue";
import ConversationModelConfigSelect from "./ConversationModelConfigSelect.vue";
import PopupSelect from "./PopupSelect.vue";
import ComposerContextBar from "./ComposerContextBar.vue";
import ComposerMoreSettings from "./ComposerMoreSettings.vue";

const settingsStore = useSettingsStore();

const props = defineProps<{
  draft: string;
  responding: boolean;
  canSend: boolean;
  canSendAttachments: boolean;
  canStop: boolean;
  runtimeAvailable: boolean;
  currentSessionId: string;
  messages: ChatMessage[];
  messagesEmpty: boolean;
  bookTitle: string;
  stageLabel: string;
  selectedModelId: string;
  selectedModel: ModelConfig | undefined;
  thinkingLevel: ThinkingLevel;
  temperature: number;
  approvalMode: AgentApprovalMode;
  agentTeamMode: AgentTeamRunMode;
  agentId: WorkspaceAgentId | LongAgentId | undefined;
  agentWorkspaceType: "short" | "script" | "long" | undefined;
  libraryDomain: LibraryAgentDomain | undefined;
  availableSkills: ComposerReferenceOption[];
  availableMaterials: ComposerReferenceOption[];
  editorReferences: EditorTextReference[];
  modelOptions: Array<{
    value: string;
    label: string;
    provider: string;
    providerLabel: string;
  }>;
  availableThinkingOptions: Array<{ value: ThinkingLevel; label: string }>;
  webSearchEnabled: boolean;
  webSearchAvailable: boolean;
  webSearchDisabledReason: string;
  showsTemperature: boolean;
  temperatureSelectOptions: Array<{ value: number; label: string }>;
  approvalOptions: Array<{
    value: AgentApprovalMode;
    label: string;
    description: string;
  }>;
  approvalModeIcon: IconName;
}>();

const emit = defineEmits<{
  "update:draft": [value: string];
  send: [attachments: UserPromptAttachment[]];
  stop: [];
  clearEditorReferences: [];
  removeEditorReference: [referenceId: string];
  locateEditorReference: [reference: EditorTextReference];
  selectModel: [modelId: string];
  selectThinking: [level: ThinkingLevel];
  toggleWebSearch: [enabled: boolean];
  selectTemperature: [temperature: number];
  selectApproval: [mode: AgentApprovalMode];
  selectAgentTeamMode: [mode: AgentTeamRunMode];
}>();

const closeReferenceMenuHolder = { run() {} };
const {
  attachmentInput,
  pendingAttachments,
  readingAttachments,
  openAttachmentPicker,
  handleAttachmentChange,
  handleComposerPaste,
  removePendingAttachment
} = useConversationAttachments({
  currentSessionId: () => props.currentSessionId,
  closeReferenceMenu: () => closeReferenceMenuHolder.run()
});
const {
  composerInput,
  activeReference,
  activeReferenceIndex,
  canSubmit,
  referenceOptions,
  filteredReferenceOptions,
  referenceMenuTitle,
  referenceMenuHint,
  composerPlaceholder,
  updateActiveReference,
  handleInput,
  closeReferenceMenu,
  focusInput,
  selectReference,
  submitMessage,
  handleKeydown
} = useConversationComposer({
  draft: () => props.draft,
  canSend: () => props.canSend,
  canSendAttachments: () => props.canSendAttachments,
  runtimeAvailable: () => props.runtimeAvailable,
  libraryDomain: () => props.libraryDomain,
  availableSkills: () => props.availableSkills,
  availableMaterials: () => props.availableMaterials,
  editorReferences: () => props.editorReferences,
  pendingAttachments,
  readingAttachments,
  emitDraft: (value) => emit("update:draft", value),
  emitSend: (attachments) => emit("send", attachments),
  emitClearEditorReferences: () => emit("clearEditorReferences")
});
closeReferenceMenuHolder.run = closeReferenceMenu;

function editorReferenceTooltip(reference: EditorTextReference): string {
  const preview =
    reference.text.length > 1_000
      ? `${reference.text.slice(0, 1_000)}…`
      : reference.text;
  return `${reference.documentPath.join(" / ")}\n第 ${reference.startLine}-${reference.endLine} 行\n\n${preview}`;
}
function handleApprovalChange(value: string | number): void {
  if (value === "request-approval" || value === "auto-approve")
    emit("selectApproval", value);
}

defineExpose({ focusInput });
</script>

<template>
  <footer class="composer-wrap">
    <div class="composer-stack">
      <div
        v-if="activeReference"
        id="composer-reference-menu"
        class="composer-reference-menu"
        role="listbox"
        :aria-label="referenceMenuTitle"
      >
        <div class="composer-reference-heading">
          <span class="composer-reference-trigger">{{
            activeReference.trigger
          }}</span>
          <div>
            <strong>{{ referenceMenuTitle }}</strong>
            <span>{{ referenceMenuHint }}</span>
          </div>
          <kbd>Esc</kbd>
        </div>
        <div
          v-if="filteredReferenceOptions.length"
          class="composer-reference-options"
        >
          <button
            v-for="(option, index) in filteredReferenceOptions"
            :id="`composer-reference-option-${index}`"
            :key="option.id"
            type="button"
            role="option"
            :aria-selected="index === activeReferenceIndex"
            :class="{ 'is-selected': index === activeReferenceIndex }"
            @mouseenter="activeReferenceIndex = index"
            @mousedown.prevent="selectReference(option)"
          >
            <span class="composer-reference-icon">
              <AppIcon
                :name="activeReference.trigger === '/' ? 'sparkles' : 'archive'"
                :size="17"
              />
            </span>
            <span class="composer-reference-copy">
              <strong>{{ option.label }}</strong>
              <small>{{ option.detail }}</small>
            </span>
            <span class="composer-reference-token">{{
              activeReference.trigger
            }}</span>
          </button>
        </div>
        <div v-else class="composer-reference-empty">
          {{
            referenceOptions.length
              ? "没有匹配的内容"
              : activeReference.trigger === "/"
                ? "当前智能体没有可调用的技能"
                : "当前智能体没有可用素材"
          }}
        </div>
        <div class="composer-reference-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 插入</span>
        </div>
      </div>

      <div class="composer" :class="{ 'is-disabled': responding }">
        <ComposerContextBar
          v-if="messagesEmpty"
          :book-title="bookTitle"
          :stage-label="stageLabel"
          :responding="responding"
        />
        <div class="composer-input-surface">
          <input
            ref="attachmentInput"
            class="composer-file-input"
            type="file"
            multiple
            :accept="PROMPT_ATTACHMENT_ACCEPT"
            tabindex="-1"
            aria-hidden="true"
            @change="handleAttachmentChange"
          />
          <div
            v-if="editorReferences.length"
            class="composer-editor-reference-list"
            aria-label="已引用正文选区列表"
          >
            <div
              v-for="editorReference in editorReferences"
              :key="editorReference.id"
              class="composer-editor-reference"
            >
              <button
                class="composer-editor-reference-main"
                type="button"
                :title="editorReferenceTooltip(editorReference)"
                :aria-label="`定位到 ${editorReference.label}`"
                @click="emit('locateEditorReference', editorReference)"
              >
                <AppIcon name="quote" :size="13" />
                <span>{{ editorReference.label }}</span>
              </button>
              <button
                class="composer-editor-reference-remove"
                type="button"
                :aria-label="`移除正文引用 ${editorReference.label}`"
                :disabled="responding"
                @click="emit('removeEditorReference', editorReference.id)"
              >
                <AppIcon name="close" :size="11" />
              </button>
            </div>
          </div>
          <div
            v-if="pendingAttachments.length || readingAttachments"
            class="composer-attachment-list"
            aria-label="待发送附件"
          >
            <article
              v-for="attachment in pendingAttachments"
              :key="attachment.id"
              class="composer-attachment-chip"
            >
              <img
                v-if="attachmentPreview(attachment)"
                :src="attachmentPreview(attachment)"
                alt=""
              />
              <span v-else class="composer-attachment-icon" aria-hidden="true">
                <AppIcon name="file" :size="16" />
              </span>
              <span class="composer-attachment-copy">
                <strong>{{ attachment.name }}</strong>
                <small>
                  {{
                    attachment.kind === "image"
                      ? "图片"
                      : attachment.mediaType === "application/pdf"
                        ? "PDF 文本"
                        : "文本"
                  }}
                  · {{ formatFileSize(attachment.size) }}
                  <template
                    v-if="attachment.kind === 'text' && attachment.truncated"
                  >
                    · 已截断</template
                  >
                </small>
              </span>
              <button
                type="button"
                :aria-label="`移除附件 ${attachment.name}`"
                :disabled="responding"
                @click="removePendingAttachment(attachment.id)"
              >
                <AppIcon name="close" :size="13" />
              </button>
            </article>
            <span v-if="readingAttachments" class="composer-attachment-loading">
              正在读取附件…
            </span>
          </div>
          <textarea
            ref="composerInput"
            :value="draft"
            rows="1"
            :placeholder="composerPlaceholder"
            aria-label="智能体消息"
            aria-autocomplete="list"
            :aria-expanded="Boolean(activeReference)"
            :aria-controls="
              activeReference ? 'composer-reference-menu' : undefined
            "
            :aria-activedescendant="
              activeReference && filteredReferenceOptions.length
                ? `composer-reference-option-${activeReferenceIndex}`
                : undefined
            "
            :disabled="responding || !runtimeAvailable"
            @blur="closeReferenceMenu"
            @click="updateActiveReference($event.target as HTMLTextAreaElement)"
            @input="handleInput"
            @keydown="handleKeydown"
            @paste="handleComposerPaste"
          />
          <div class="composer-toolbar">
            <div class="composer-tools">
              <button
                class="round-tool-button"
                type="button"
                aria-label="上传附件"
                title="上传 TXT、MD、PDF、Word（.docx）或图片"
                :disabled="
                  responding || !runtimeAvailable || readingAttachments
                "
                @click="openAttachmentPicker"
              >
                <AppIcon name="plus" :size="18" />
              </button>
              <ConversationModelConfigSelect
                :selected-model-id="selectedModelId"
                :model-options="modelOptions"
                :thinking-level="thinkingLevel"
                :thinking-options="availableThinkingOptions"
                :temperature="temperature"
                :temperature-options="temperatureSelectOptions"
                :shows-temperature="showsTemperature"
                :web-search-enabled="webSearchEnabled"
                :web-search-available="webSearchAvailable"
                :web-search-disabled-reason="webSearchDisabledReason"
                :responding="responding"
                @select-model="emit('selectModel', $event)"
                @select-thinking="emit('selectThinking', $event)"
                @select-temperature="emit('selectTemperature', $event)"
                @toggle-web-search="emit('toggleWebSearch', $event)"
              />
            </div>
            <div class="composer-actions">
              <ComposerMoreSettings>
                <ContextWindowIndicator
                  v-if="settingsStore.generalSettings.showContextUsage"
                  :messages="messages"
                  :model="selectedModel"
                />
                <ContextCompactionButton
                  v-if="!messagesEmpty"
                  :session-id="currentSessionId"
                  :disabled="responding"
                />
                <AgentTeamModeSelect
                  v-if="agentWorkspaceType && agentId"
                  :model-value="agentTeamMode"
                  :workspace-type="agentWorkspaceType"
                  :parent-agent-id="agentId"
                  @update:model-value="emit('selectAgentTeamMode', $event)"
                />
                <PopupSelect
                  :model-value="approvalMode"
                  :options="approvalOptions"
                  accessible-label="选择正文修改权限"
                  variant="compact"
                  align="end"
                  :menu-min-width="300"
                  @update:model-value="handleApprovalChange"
                >
                  <template #prefix
                    ><AppIcon :name="approvalModeIcon" :size="14"
                  /></template>
                </PopupSelect>
              </ComposerMoreSettings>
              <button
                class="round-tool-button"
                type="button"
                aria-label="语音输入"
              >
                <AppIcon name="mic" :size="18" />
              </button>
              <button
                v-if="!responding"
                class="send-button"
                type="button"
                aria-label="发送消息"
                :disabled="!canSubmit"
                @click="submitMessage"
              >
                <AppIcon name="arrow-up" :size="18" />
              </button>
              <button
                v-else
                class="send-button stop-button"
                type="button"
                aria-label="停止生成"
                title="停止生成"
                :disabled="!canStop"
                @click="emit('stop')"
              >
                <AppIcon name="stop" :size="15" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>
