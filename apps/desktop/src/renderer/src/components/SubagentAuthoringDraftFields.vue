<script setup lang="ts">
import {
  SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH
} from "@deepwrite/contracts/renderer";
import { createScopedTranslator } from "../i18n";

const t = createScopedTranslator("components.subagentAuthoringDraftFields");

const name = defineModel<string>("name", { required: true });
const description = defineModel<string>("description", { required: true });
const systemPrompt = defineModel<string>("systemPrompt", { required: true });
defineProps<{ disabled: boolean }>();
</script>

<template>
  <div class="draft-fields">
    <label class="draft-field">
      <span>{{ t("name") }}</span>
      <input
        v-model="name"
        type="text"
        :disabled="disabled"
        :maxlength="SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH"
      />
    </label>
    <label class="draft-field">
      <span>{{ t("capabilities") }}</span>
      <textarea
        v-model="description"
        class="draft-description"
        :disabled="disabled"
        :maxlength="SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH"
      />
    </label>
    <label class="draft-field">
      <span class="draft-field-heading">
        {{ t("systemPrompt") }}
        <small
          >{{ systemPrompt.length }} /
          {{ SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH }}</small
        >
      </span>
      <textarea
        v-model="systemPrompt"
        class="draft-prompt"
        spellcheck="false"
        :disabled="disabled"
        :maxlength="SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH"
      />
    </label>
  </div>
</template>

<style scoped>
.draft-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.draft-field {
  display: grid;
  gap: 6px;
}
.draft-field > span {
  color: var(--text-secondary);
  font-size: 0.821429rem;
  font-weight: 620;
}
.draft-field-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.draft-field-heading small {
  color: var(--text-tertiary);
  font-size: 0.75rem;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.draft-field input,
.draft-field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--theme-line);
  border-radius: 9px;
  outline: 0;
  background: var(--surface-main);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.857143rem;
  line-height: 1.6;
  resize: vertical;
}
.draft-field input {
  min-height: 38px;
  padding: 8px 10px;
}
.draft-field textarea {
  padding: 9px 10px;
}
.draft-field .draft-description {
  min-height: 76px;
}
.draft-field .draft-prompt {
  min-height: 240px;
  font-family: var(--code-font);
}
.draft-field input:focus,
.draft-field textarea:focus {
  border-color: var(--accent);
  background: var(--surface-main);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
</style>
