<script setup lang="ts">
import { documentFormatLabel } from "./catalogLabels";
import { createScopedTranslator } from "../i18n";
import { computed, defineAsyncComponent } from "vue";
import type { WorkspaceDocument } from "../types/workspace";
import { parseSkillFrontmatter } from "../utils/skillFrontmatter";
import DocumentMetaRow from "./DocumentMetaRow.vue";

const t = createScopedTranslator("components.editorDocumentMetadata");

const MaterialMetadataEditor = defineAsyncComponent(
  () => import("./MaterialMetadataEditor.vue")
);
const SkillMetadataEditor = defineAsyncComponent(
  () => import("./SkillMetadataEditor.vue")
);

const props = defineProps<{
  document: WorkspaceDocument;
  title: string;
  content: string;
  boundToCurrentBook?: boolean;
  locked: boolean;
}>();
const emit = defineEmits<{ change: [content: string] }>();
const skillFormatError = computed(() => {
  if (props.document.domain !== "skill" || !props.document.catalogEntryId)
    return undefined;
  const result = parseSkillFrontmatter(props.content);
  return result.valid ? undefined : result.message;
});
</script>

<template>
  <DocumentMetaRow>
    <span>{{ document.eyebrow }}</span>
    <span v-if="document.format" class="document-format">{{
      documentFormatLabel(document.format)
    }}</span>
    <span v-if="document.readOnly" class="readonly-badge">{{
      t("readOnlyContent")
    }}</span>
    <span v-if="document.domain !== 'creation'" class="readonly-badge">{{
      boundToCurrentBook
        ? t("linkedToTheCurrentBook")
        : t("browseOnlyNotLinked")
    }}</span>
    <span
      v-if="skillFormatError"
      class="skill-format-error-badge"
      role="status"
      :title="skillFormatError"
      :aria-label="skillFormatError"
      >{{ skillFormatError }}</span
    >
    <template #actions>
      <MaterialMetadataEditor
        v-if="document.domain === 'material' && document.catalogEntryId"
        :entry-id="document.catalogEntryId"
        :title="title"
        :content="content"
        :read-only="document.readOnly || locked"
        @change="emit('change', $event)"
      />
      <SkillMetadataEditor
        v-else-if="document.domain === 'skill' && document.catalogEntryId"
        :entry-id="document.catalogEntryId"
        :title="title"
        :content="content"
        :read-only="document.readOnly || locked"
        @change="emit('change', $event)"
      />
    </template>
  </DocumentMetaRow>
</template>
