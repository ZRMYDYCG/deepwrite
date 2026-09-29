<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import { CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH } from "@deepwrite/contracts/renderer";
import PopupSelect from "../../components/PopupSelect.vue";
import type { ChatAssistantModeFeature } from "./useChatAssistantMode";
import { useChatAssistantProjectConfig } from "./useChatAssistantProjectConfig";

const t = createScopedTranslator("extras");
const props = defineProps<{ assistant: ChatAssistantModeFeature }>();
const {
  projectConfigOpen,
  projectConfigMode,
  projectConfigProjectKey,
  projectConfigPrompt,
  projectConfigCustomized,
  projectConfigPending,
  projectBookOptions,
  projectConfigOption,
  projectConfigTitle,
  updateProjectAssociation,
  saveProjectConfig,
  resetProjectConfig,
  openAddProject,
  openEditProject
} = useChatAssistantProjectConfig(props.assistant);
defineExpose({
  openAddProject,
  openEditProject,
  pending: projectConfigPending
});
</script>
<template>
  <div
    v-if="projectConfigOpen"
    class="chat-assistant-config-backdrop"
    @mousedown.self="!projectConfigPending && (projectConfigOpen = false)"
    @keydown.esc.stop.prevent="
      !projectConfigPending && (projectConfigOpen = false)
    "
  >
    <section
      class="chat-assistant-config-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('chatAssistant.projectConfiguration')"
    >
      <header>
        <div>
          <strong>{{ projectConfigTitle }}</strong>
          <span>{{ t("chatAssistant.projectConfigurationDescription") }}</span>
        </div>
        <button
          type="button"
          :aria-label="t('chatAssistant.closeProjectConfiguration')"
          :disabled="projectConfigPending"
          @click="projectConfigOpen = false"
        >
          ×
        </button>
      </header>
      <label for="chat-assistant-project-book">{{
        t("chatAssistant.linkedBook")
      }}</label>
      <PopupSelect
        id="chat-assistant-project-book"
        :model-value="projectConfigProjectKey"
        :options="projectBookOptions"
        :accessible-label="t('chatAssistant.linkedBook')"
        :placeholder="t('chatAssistant.chooseBookType')"
        :disabled="projectConfigMode === 'edit' || projectConfigPending"
        :menu-min-width="320"
        :menu-z-index="130"
        @update:model-value="updateProjectAssociation"
      />
      <p class="chat-assistant-project-lock-hint">
        {{
          projectConfigMode === "edit"
            ? t("chatAssistant.bookLinkLocked")
            : t("chatAssistant.bookLinkLocksOnSave")
        }}
      </p>
      <label for="chat-assistant-project-prompt">{{
        t("chatAssistant.projectPrompt")
      }}</label>
      <textarea
        id="chat-assistant-project-prompt"
        v-model="projectConfigPrompt"
        :maxlength="CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH"
        :disabled="projectConfigPending || !projectConfigOption"
        rows="10"
      />
      <div class="chat-assistant-config-meta">
        <span>{{
          projectConfigCustomized
            ? t("chatAssistant.usingCustomPrompt")
            : t("chatAssistant.usingDefaultPrompt")
        }}</span>
        <span
          >{{ projectConfigPrompt.length }} /
          {{ CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH }}</span
        >
      </div>
      <p>{{ t("chatAssistant.projectPromptBoundaries") }}</p>
      <footer>
        <button
          type="button"
          class="is-secondary"
          :disabled="projectConfigPending || !projectConfigOption"
          @click="resetProjectConfig"
        >
          {{ t("longBookAnalysis.restoreDefault") }}
        </button>
        <span />
        <button
          type="button"
          class="is-secondary"
          :disabled="projectConfigPending"
          @click="projectConfigOpen = false"
        >
          {{ t("cloudBackup.cancel") }}
        </button>
        <button
          type="button"
          class="is-primary"
          :disabled="projectConfigPending || !projectConfigOption"
          @click="saveProjectConfig"
        >
          {{ t("chatAssistant.save") }}
        </button>
      </footer>
    </section>
  </div>
</template>
<style scoped src="./chat-assistant-config.css"></style>
