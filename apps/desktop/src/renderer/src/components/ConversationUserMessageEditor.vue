<script setup lang="ts">
import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import { computed, nextTick, onMounted, ref } from "vue";
import type { ConversationMessageRewriteRequest } from "../types/conversation";
import { uiMessage } from "../ui-feedback";
import { CONVERSATION_MESSAGE_MAX_LENGTH } from "../composables/agent-conversation/history-rewrite";

const t = createScopedTranslator("components.conversationUserMessageEditor");

const props = defineProps<{
  messageId: string;
  initialContent: string;
  disabled?: boolean;
  submitEditedMessage(
    request: ConversationMessageRewriteRequest
  ): Promise<boolean>;
}>();

const emit = defineEmits<{
  cancel: [];
}>();

const content = ref(props.initialContent);
const textarea = ref<HTMLTextAreaElement>();
const submitting = ref(false);
const canSubmit = computed(
  () =>
    !submitting.value &&
    !props.disabled &&
    content.value.trim().length > 0 &&
    content.value.trim().length <= CONVERSATION_MESSAGE_MAX_LENGTH
);

function resizeTextarea(): void {
  const element = textarea.value;
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
}

function cancel(): void {
  if (!submitting.value) emit("cancel");
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const started = await props.submitEditedMessage({
      messageId: props.messageId,
      content: content.value
    });
    if (!started) {
      submitting.value = false;
      await nextTick();
      textarea.value?.focus();
    }
  } catch (error: unknown) {
    submitting.value = false;
    uiMessage.error(formatError(error, t("couldNotResendTryAgainLater")));
    await nextTick();
    textarea.value?.focus();
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void submit();
  }
}

onMounted(async () => {
  await nextTick();
  resizeTextarea();
  const element = textarea.value;
  if (!element) return;
  element.focus();
  element.setSelectionRange(element.value.length, element.value.length);
});
</script>

<template>
  <form
    class="conversation-message-editor"
    :aria-busy="submitting"
    @submit.prevent="submit"
  >
    <textarea
      ref="textarea"
      v-model="content"
      :maxlength="CONVERSATION_MESSAGE_MAX_LENGTH"
      :disabled="submitting || disabled"
      :aria-label="t('editPreviousQuestion')"
      rows="2"
      @input="resizeTextarea"
      @keydown="handleKeydown"
    />
    <div class="conversation-message-editor-actions">
      <button type="button" :disabled="submitting" @click="cancel">
        {{ t("cancel") }}
      </button>
      <button class="is-primary" type="submit" :disabled="!canSubmit">
        {{ submitting ? t("sending") : t("send") }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.conversation-message-editor {
  width: 100%;
  padding: 14px 16px 12px;
  border: 1px solid transparent;
  border-radius: 20px;
  background: var(--surface-muted);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.conversation-message-editor:focus-within {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--theme-line));
  box-shadow: 0 0 0 3px var(--accent-soft);
}

textarea {
  display: block;
  width: 100%;
  min-height: 64px;
  max-height: 320px;
  padding: 0;
  overflow-y: auto;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  line-height: 1.6;
}

textarea::placeholder {
  color: var(--text-tertiary);
}

.conversation-message-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

button {
  min-width: 64px;
  min-height: 36px;
  padding: 7px 15px;
  border: 1px solid var(--theme-line);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: var(--surface-hover);
}

button.is-primary {
  border-color: var(--neutral-solid);
  background: var(--neutral-solid);
  color: #fff;
}

button.is-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--neutral-solid) 88%, #fff);
}

button:disabled {
  cursor: default;
  opacity: 0.5;
}

@media (max-width: 720px) {
  .conversation-message-editor {
    padding: 12px;
    border-radius: 16px;
  }
}
</style>
