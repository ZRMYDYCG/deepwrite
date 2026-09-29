<script setup lang="ts">
import { createScopedTranslator, locale } from "../../i18n";
import { computed, ref, watch } from "vue";
import AppIcon from "../../components/AppIcon.vue";
import ChapterEditor from "./ChapterEditor.vue";
import type { LongBookAnalysisController } from "./useLongBookAnalysis";

const t = createScopedTranslator("extras.longBookAnalysis");
const props = defineProps<{ controller: LongBookAnalysisController }>();
const expanded = ref(false);
const source = computed(() => props.controller.source.value);
const characters = computed(
  () =>
    source.value?.chapters.reduce(
      (total, chapter) => total + chapter.charCount,
      0
    ) ?? 0
);
watch(
  () => source.value?.id,
  () => {
    expanded.value = false;
  }
);
</script>
<template>
  <section v-if="source" class="analysis-card analysis-source-summary">
    <div class="analysis-source-summary-row">
      <div>
        <strong>{{ source.name }}</strong>
        <p>
          {{
            t("sourceSize", {
              chapters: source.chapters.length.toLocaleString(locale),
              characters: characters.toLocaleString(locale)
            })
          }}<span v-if="source.diagnostics.length">{{
            t("importNotes", {
              count: source.diagnostics.length
            })
          }}</span>
        </p>
      </div>
      <button
        type="button"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? t("collapseText") : t("reviewAndCorrect") }}
      </button>
    </div>
    <ChapterEditor
      v-if="expanded"
      :source="source"
      :disabled="controller.isBusy.value"
      @update="controller.replaceChapters($event)"
    />
  </section>
  <section v-else class="analysis-card analysis-empty-source">
    <div class="analysis-empty-icon"><AppIcon name="book" :size="24" /></div>
    <div class="analysis-empty-copy">
      <strong>{{ t("importNovelToStart") }}</strong>
      <p>{{ t("novelImportHelp") }}</p>
    </div>
    <div class="analysis-empty-meta">
      <span>TXT / Markdown</span><span>{{ t("maxFiftyChapters") }}</span>
    </div>
  </section>
</template>

<style scoped>
.analysis-source-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.analysis-source-summary-row > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.analysis-source-summary-row p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 0.857143rem;
}
.analysis-source-summary .chapter-editor {
  margin-top: 16px;
}
</style>
