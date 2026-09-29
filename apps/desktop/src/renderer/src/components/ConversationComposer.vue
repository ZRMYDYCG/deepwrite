<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
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
import { useVoiceInput } from "../composables/useVoiceInput";
import { useSettingsStore } from "../stores/settingsStore";
import AppIcon from "./AppIcon.vue";
import AgentTeamModeSelect from "./AgentTeamModeSelect.vue";
import ContextCompactionButton from "./ContextCompactionButton.vue";
import ContextWindowIndicator from "./ContextWindowIndicator.vue";
import ConversationModelConfigSelect from "./ConversationModelConfigSelect.vue";
import PopupSelect from "./PopupSelect.vue";
import ComposerContextBar from "./ComposerContextBar.vue";
import ComposerMoreSettings from "./ComposerMoreSettings.vue";
import VoiceInputBar from "./VoiceInputBar.vue";

const t = createScopedTranslator("components.conversationComposer");

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

const voice = useVoiceInput({
  sessionKey: () => props.currentSessionId,
  draft: () => props.draft,
  input: composerInput,
  updateDraft: (value) => emit("update:draft", value),
  canStart: () => !props.responding && props.runtimeAvailable,
  canSend: () => canSubmit.value && !props.responding && props.runtimeAvailable,
  send: submitMessage
});

function startVoice(): void {
  closeReferenceMenu();
  void voice.start();
}

function editorReferenceTooltip(reference: EditorTextReference): string {
  const preview =
    reference.text.length > 1_000
      ? `${reference.text.slice(0, 1_000)}…`
      : reference.text;
  return t("valueLinesValueValueValue", {
    arg0: reference.documentPath.join(" / "),
    arg1: reference.startLine,
    arg2: reference.endLine,
    arg3: preview
  });
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
              ? t("noMatchingContent")
              : activeReference.trigger === "/"
                ? t("thisAgentHasNoAvailableSkills")
                : t("thisAgentHasNoAvailableMaterials")
          }}
        </div>
        <div class="composer-reference-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ t("select") }}</span>
          <span><kbd>Enter</kbd> {{ t("insert") }}</span>
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
            :aria-label="t('referencedManuscriptSelections')"
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
                :aria-label="
                  t('goToValue', {
                    arg0: editorReference.label
                  })
                "
                @click="emit('locateEditorReference', editorReference)"
              >
                <AppIcon name="quote" :size="13" />
                <span>{{ editorReference.label }}</span>
              </button>
              <button
                class="composer-editor-reference-remove"
                type="button"
                :aria-label="
                  t('removeManuscriptReferenceValue', {
                    arg0: editorReference.label
                  })
                "
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
            :aria-label="t('attachmentsToSend')"
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
                      ? t("image")
                      : attachment.mediaType === "application/pdf"
                        ? t("pDFText")
                        : t("text")
                  }}
                  · {{ formatFileSize(attachment.size) }}
                  <template
                    v-if="attachment.kind === 'text' && attachment.truncated"
                  >
                    {{ t("truncated") }}</template
                  >
                </small>
              </span>
              <button
                type="button"
                :aria-label="
                  t('removeAttachmentValue', {
                    arg0: attachment.name
                  })
                "
                :disabled="responding"
                @click="removePendingAttachment(attachment.id)"
              >
                <AppIcon name="close" :size="13" />
              </button>
            </article>
            <span v-if="readingAttachments" class="composer-attachment-loading">
              {{ t("readingAttachments") }}
            </span>
          </div>
          <textarea
            ref="composerInput"
            :value="draft"
            rows="1"
            :placeholder="composerPlaceholder"
            :aria-label="t('agentMessage')"
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
            :disabled="responding || !runtimeAvailable || voice.active.value"
            @blur="closeReferenceMenu"
            @click="updateActiveReference($event.target as HTMLTextAreaElement)"
            @input="handleInput"
            @keydown="handleKeydown"
            @paste="handleComposerPaste"
          />
          <VoiceInputBar
            v-if="voice.active.value"
            :state="voice.state.value"
            :elapsed-ms="voice.elapsedMs.value"
            :levels="voice.levels.value"
            :send-disabled="responding || !runtimeAvailable"
            @cancel="voice.cancel"
            @stop="voice.stop"
            @send="voice.stopAndSend"
            @retry="voice.retry"
          />
          <div v-else class="composer-toolbar">
            <div class="composer-tools">
              <button
                class="round-tool-button"
                type="button"
                :aria-label="t('uploadAttachment')"
                :title="t('uploadTXTMDPDFWordDocxOrImages')"
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
                  v-if="
                    settingsStore.generalSettings.contextCompaction
                      .showManualButton && !messagesEmpty
                  "
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
                  :accessible-label="t('selectManuscriptEditingPermission')"
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
                :aria-label="t('voiceInput')"
                :title="t('voiceInput')"
                :disabled="responding || !runtimeAvailable"
                @click="startVoice"
              >
                <AppIcon name="mic" :size="18" />
              </button>
              <button
                v-if="!responding"
                class="send-button"
                type="button"
                :aria-label="t('sendMessage')"
                :disabled="!canSubmit"
                @click="submitMessage"
              >
                <AppIcon name="arrow-up" :size="18" />
              </button>
              <button
                v-else
                class="send-button stop-button"
                type="button"
                :aria-label="t('stopGeneration')"
                :title="t('stopGeneration')"
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
