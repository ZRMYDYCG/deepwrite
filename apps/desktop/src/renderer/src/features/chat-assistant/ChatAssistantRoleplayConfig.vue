<script setup lang="ts">
import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import { nextTick, ref } from "vue";
import {
  CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH,
  ChatRoleplayProfileSchema,
  type ChatRoleplayProfile
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../../ui-feedback";
import type { ChatAssistantModeFeature } from "./useChatAssistantMode";

const t = createScopedTranslator("extras");
const props = defineProps<{ assistant: ChatAssistantModeFeature }>();
const opened = ref(false);
const pending = ref(false);
const editingId = ref("");
const name = ref("");
const prompt = ref("");
const nameInput = ref<HTMLInputElement | null>(null);
function open(config?: ChatRoleplayProfile): void {
  if (props.assistant.isBusy.value) return;
  editingId.value = config?.id ?? "";
  name.value = config?.name ?? "";
  prompt.value = config?.systemPrompt ?? "";
  opened.value = true;
  void nextTick(() => nameInput.value?.focus());
}
async function save(): Promise<void> {
  if (pending.value || props.assistant.isBusy.value) return;
  if (!name.value.trim()) {
    uiMessage.warning(t("chatAssistant.characterNameRequired"));
    return;
  }
  if (!prompt.value.trim()) {
    uiMessage.warning(t("chatAssistant.characterPromptRequired"));
    return;
  }
  const config = ChatRoleplayProfileSchema.omit({ builtin: true }).safeParse({
    id: editingId.value || crypto.randomUUID(),
    name: name.value,
    systemPrompt: prompt.value
  });
  if (!config.success) {
    uiMessage.warning(t("chatAssistant.characterLimits"));
    return;
  }
  pending.value = true;
  try {
    const saved = await props.assistant.saveRole(config.data);
    props.assistant.selectRole(saved.id);
    opened.value = false;
    uiMessage.success(t("chatAssistant.characterSaved"));
  } catch (error) {
    uiMessage.error(formatError(error, t("chatAssistant.characterSaveFailed")));
  } finally {
    pending.value = false;
  }
}
defineExpose({ open, pending });
</script>
<template>
  <div
    v-if="opened"
    class="chat-assistant-config-backdrop"
    @mousedown.self="!pending && (opened = false)"
    @keydown.esc.stop.prevent="!pending && (opened = false)"
  >
    <section
      class="chat-assistant-config-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('chatAssistant.roleplayConfiguration')"
    >
      <header>
        <div>
          <strong>{{
            editingId
              ? t("chatAssistant.editRoleplay")
              : t("chatAssistant.addRoleplay")
          }}</strong
          ><span>{{ t("chatAssistant.characterDescription") }}</span>
        </div>
        <button
          type="button"
          :aria-label="t('chatAssistant.closeCharacterConfiguration')"
          :disabled="pending"
          @click="opened = false"
        >
          ×
        </button>
      </header>
      <label for="chat-roleplay-name">{{
        t("chatAssistant.characterName")
      }}</label>
      <input
        id="chat-roleplay-name"
        ref="nameInput"
        v-model="name"
        :disabled="pending"
        maxlength="120"
        :placeholder="t('chatAssistant.characterNamePlaceholder')"
      />
      <label for="chat-roleplay-prompt">{{
        t("chatAssistant.characterPrompt")
      }}</label>
      <textarea
        id="chat-roleplay-prompt"
        v-model="prompt"
        :disabled="pending"
        :maxlength="CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH"
        rows="10"
        :placeholder="t('chatAssistant.characterPromptPlaceholder')"
      />
      <div class="chat-assistant-config-meta">
        <span>{{ t("chatAssistant.roleplayBoundaries") }}</span
        ><span
          >{{ prompt.length }} /
          {{ CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH }}</span
        >
      </div>
      <p>
        {{
          t("chatAssistant.promptSuffix", {
            suffix: t("chatAssistant.roleplayBoundary")
          })
        }}
      </p>
      <footer>
        <span /><button
          type="button"
          class="is-secondary"
          :disabled="pending"
          @click="opened = false"
        >
          {{ t("cloudBackup.cancel") }}</button
        ><button
          type="button"
          class="is-primary"
          :disabled="pending || assistant.isBusy.value"
          @click="save"
        >
          {{ t("chatAssistant.saveAndChat") }}
        </button>
      </footer>
    </section>
  </div>
</template>
<style scoped src="./chat-assistant-config.css"></style>
