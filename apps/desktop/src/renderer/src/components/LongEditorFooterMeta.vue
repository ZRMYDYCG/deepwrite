<script setup lang="ts">
import { createScopedTranslator, locale } from "../i18n";

const t = createScopedTranslator("components.longEditorFooterMeta");

defineProps<{
  isChapterBody: boolean;
  characterCount: number;
  autoSaveEnabled: boolean;
}>();
</script>
<template>
  <span class="long-footer-meta">
    {{
      t(isChapterBody ? "chapterCharactersMessage" : "charactersMessage", {
        arg0: characterCount.toLocaleString(locale) ?? ""
      })
    }}
    {{
      t("autosaveMessage", {
        arg0: (autoSaveEnabled ? t("on") : t("off")) ?? ""
      })
    }}
  </span>
</template>
<style scoped>
.long-footer-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
