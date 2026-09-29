<script setup lang="ts">
import { metadataEditFailureMessage } from "./metadataEditMessages";
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import {
  parseMaterialMarkdown,
  resolveMaterialMetadata,
  updateMaterialMarkdownMetadata
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../ui-feedback";
import LibraryMetadataPopover from "./LibraryMetadataPopover.vue";

const t = createScopedTranslator("components.materialMetadataEditor");

const props = defineProps<{
  content: string;
  title: string;
  entryId: string;
  readOnly: boolean;
}>();
const emit = defineEmits<{ change: [content: string] }>();
const parsed = computed(() => parseMaterialMarkdown(props.content));
const effective = computed(() =>
  resolveMaterialMetadata({
    id: props.entryId,
    title: props.title,
    content: props.content
  })
);
const preview = computed(() => ({
  title: t("currentAgentCatalog"),
  name: effective.value.name,
  nameSource:
    effective.value.nameSource === "configured"
      ? t("useConfiguredName")
      : t("useOriginalTitle"),
  description:
    effective.value.descriptionSource === "fallback"
      ? t("noNotesReadSource")
      : effective.value.description,
  descriptionSource:
    effective.value.descriptionSource === "configured"
      ? t("useConfiguredNotes")
      : effective.value.descriptionSource === "excerpt"
        ? t("useContentExcerpt")
        : t("sourceTextAvailableOnDemand")
}));
function applyMetadata(values: { name: string; description: string }): boolean {
  if (props.readOnly) return false;
  const result = updateMaterialMarkdownMetadata(props.content, values);
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
    :label="t('materialNotes')"
    :hint="t('aNameAndUsageNotesHelpTheAgentChoose')"
    :optional="true"
    :initial-name="parsed.name ?? title"
    :initial-description="parsed.description ?? ''"
    :placeholder="
      t('forExampleUsefulForMysteriesCharacterRelationshipsAndIdentity')
    "
    :preview="preview"
    :apply-metadata="applyMetadata"
  />
</template>
