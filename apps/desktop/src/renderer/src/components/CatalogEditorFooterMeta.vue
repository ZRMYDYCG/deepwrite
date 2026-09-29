<script setup lang="ts">
import { createScopedTranslator, locale } from "../i18n";
import { computed, defineAsyncComponent } from "vue";
import type { WorkspaceDocument } from "../types/workspace";
import { catalogBodyTextKind } from "../utils/bodyTextTarget";

const t = createScopedTranslator("components.catalogEditorFooterMeta");
const props = defineProps<{
  document: WorkspaceDocument;
  content: string;
  characterCount: number;
  recommendedContentLength?: number | undefined;
  isLibraryDocument: boolean;
  isLibraryOverview: boolean;
  contentExceedsRecommendedLength: boolean;
  autoSaveEnabled?: boolean | undefined;
}>();
const isBody = computed(() => Boolean(catalogBodyTextKind(props.document)));
const CatalogManuscriptCharacterCount = defineAsyncComponent(
  () => import("./CatalogManuscriptCharacterCount.vue")
);
</script>
<template>
  <div class="editor-footer-meta">
    <span>
      {{ characterCount.toLocaleString(locale)
      }}<template v-if="recommendedContentLength">
        / {{ recommendedContentLength.toLocaleString(locale) }}</template
      >
      {{ t("characters") }}
    </span>
    <span
      v-if="isLibraryDocument"
      class="library-entry-limit-hint"
      :class="{ 'limit-warning': contentExceedsRecommendedLength }"
      :title="
        isLibraryOverview
          ? t('keepMaterialOrSkillLibraryIntroductionsUnder40000')
          : t('keepEachMaterialOrSkillLibraryEntryUnder40')
      "
    >
      {{
        isLibraryOverview
          ? t("recommendedIntroductionLimit40000Characters")
          : t("recommendedEntryLimit40000CharactersAvoidUploadingExcessive")
      }}
    </span>
    <CatalogManuscriptCharacterCount
      v-if="isBody"
      :document="document"
      :content="content"
    />
    <span class="editor-save-status">{{
      t("autosaveMessage", {
        arg0: (autoSaveEnabled ? t("on") : t("off")) ?? ""
      })
    }}</span>
  </div>
</template>
