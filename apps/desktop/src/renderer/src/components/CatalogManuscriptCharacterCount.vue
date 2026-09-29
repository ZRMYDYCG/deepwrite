<script setup lang="ts">
import { createScopedTranslator, locale } from "../i18n";
import { computed, inject } from "vue";
import type { WorkspaceDocument } from "../types/workspace";
import { SHORT_MANUSCRIPT_PREVIEW_KEY } from "../composables/shortManuscriptPreviewContext";
import { useShortManuscriptCharacterCount } from "../composables/useShortManuscriptCharacterCount";

const t = createScopedTranslator("components.catalogManuscriptCharacterCount");
const props = defineProps<{ document: WorkspaceDocument; content: string }>();
const source = inject(SHORT_MANUSCRIPT_PREVIEW_KEY, null);
const liveSource = source
  ? {
      ...source,
      book: () => source.bookById?.(props.document.workspaceId ?? ""),
      drafts: computed(() => ({
        ...source.drafts.value,
        [props.document.id]: {
          title: props.document.title,
          content: props.content,
          dirty: true
        }
      }))
    }
  : null;
const { characterCount: totalCount, loading } =
  useShortManuscriptCharacterCount(
    liveSource,
    () => true,
    () => t("couldNotCountTheFullManuscriptReopenTheWork")
  );
</script>
<template>
  <span>{{
    t("fullManuscriptMessage", {
      arg0:
        (totalCount === null
          ? loading
            ? t("counting")
            : t("characterCountUnavailable")
          : t("valueCharacters", {
              arg0: totalCount.toLocaleString(locale)
            })) ?? ""
    })
  }}</span>
</template>
