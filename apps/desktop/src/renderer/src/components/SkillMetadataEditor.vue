<script setup lang="ts">
import { metadataEditFailureMessage } from "./metadataEditMessages";
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import {
  parseSkillMarkdown,
  readSkillMarkdownMetadata,
  updateSkillMarkdownMetadata
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../ui-feedback";
import LibraryMetadataPopover from "./LibraryMetadataPopover.vue";

const t = createScopedTranslator("components.skillMetadataEditor");

const props = defineProps<{
  content: string;
  title: string;
  entryId: string;
  readOnly: boolean;
}>();
const emit = defineEmits<{ change: [content: string] }>();
const fields = computed(() => readSkillMarkdownMetadata(props.content));
const preview = computed(() => ({
  title: parseSkillMarkdown(props.content).valid
    ? t("currentAgentCatalog")
    : t("currentSkillNotes"),
  name: fields.value.name || t("nameNotProvided"),
  nameSource: fields.value.name ? t("useConfiguredName") : t("nameRequired"),
  description: fields.value.description || t("usageNotesNotProvided"),
  descriptionSource: fields.value.description
    ? t("useConfiguredNotes")
    : t("usageNotesRequired")
}));
function applyMetadata(values: { name: string; description: string }): boolean {
  if (props.readOnly) return false;
  const result = updateSkillMarkdownMetadata(props.content, values);
  if (!result.updated) {
    uiMessage.info(metadataEditFailureMessage(result));
    return false;
  }
  emit("change", result.content);
  return true;
}
</script>

<template>
  <LibraryMetadataPopover
    :content="content"
    :entry-id="entryId"
    :read-only="readOnly"
    :label="t('skillNotes')"
    :hint="t('provideANameAndUsageNotesToHelpThe')"
    :optional="false"
    :initial-name="fields.name ?? title"
    :initial-description="fields.description ?? ''"
    :placeholder="
      t('forExampleUseWhenDesigningCharacterRelationshipsToExamine')
    "
    :preview="preview"
    :apply-metadata="applyMetadata"
  />
</template>
