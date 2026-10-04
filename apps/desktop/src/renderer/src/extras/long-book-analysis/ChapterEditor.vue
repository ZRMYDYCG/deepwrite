<script setup lang="ts">
import { formatError } from "../../i18n/errors";
import { createScopedTranslator, locale } from "../../i18n";
import { computed, nextTick, ref, watch } from "vue";
import type {
  LongBookAnalysisChapter,
  LongBookAnalysisSource
} from "@deepwrite/contracts/renderer";
import AppIcon from "../../components/AppIcon.vue";
import { uiMessage } from "../../ui-feedback";
import {
  deleteAnalysisChapter,
  mergeAnalysisChapter,
  moveAnalysisChapter,
  renameAnalysisChapter,
  splitAnalysisChapter
} from "./chapter-editing";

const t = createScopedTranslator("extras.longBookAnalysis");

const props = defineProps<{
  source: LongBookAnalysisSource;
  disabled: boolean;
}>();

const emit = defineEmits<{
  update: [chapters: LongBookAnalysisChapter[]];
}>();

const PAGE_SIZE = 100;
const page = ref(1);
const selectedId = ref(props.source.chapters[0]?.id ?? "");
const preview = ref<HTMLTextAreaElement | null>(null);
const draggedId = ref<string | null>(null);
const selected = computed(
  () =>
    props.source.chapters.find((chapter) => chapter.id === selectedId.value) ??
    null
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.source.chapters.length / PAGE_SIZE))
);
const visibleChapters = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return props.source.chapters.slice(start, start + PAGE_SIZE);
});

watch(
  () => props.source.id,
  () => {
    selectedId.value = props.source.chapters[0]?.id ?? "";
    page.value = 1;
  }
);

watch(
  () => props.source.chapters,
  (chapters, previous) => {
    if (!chapters.some((chapter) => chapter.id === selectedId.value)) {
      const index = Math.max(
        0,
        previous.findIndex((chapter) => chapter.id === selectedId.value)
      );
      selectedId.value =
        chapters[Math.min(index, chapters.length - 1)]?.id ?? "";
    }
    page.value = Math.min(page.value, pageCount.value);
  }
);

function apply(operation: () => LongBookAnalysisChapter[]): void {
  try {
    emit("update", operation());
  } catch (error: unknown) {
    uiMessage.warning(formatError(error, t("chapterCorrectionFailed")));
  }
}

function selectChapter(chapter: LongBookAnalysisChapter): void {
  selectedId.value = chapter.id;
}

function rename(chapter: LongBookAnalysisChapter, event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.value === chapter.title)
    return;
  apply(() =>
    renameAnalysisChapter(props.source.chapters, chapter.id, input.value)
  );
}

function move(chapterId: string, direction: -1 | 1): void {
  const current = props.source.chapters.findIndex(
    (chapter) => chapter.id === chapterId
  );
  if (current < 0) return;
  apply(() =>
    moveAnalysisChapter(props.source.chapters, chapterId, current + direction)
  );
}

function remove(chapterId: string): void {
  if (props.disabled) return;
  apply(() => deleteAnalysisChapter(props.source.chapters, chapterId));
}

function dropOn(targetId: string): void {
  const sourceId = draggedId.value;
  draggedId.value = null;
  if (!sourceId || sourceId === targetId) return;
  const targetIndex = props.source.chapters.findIndex(
    (chapter) => chapter.id === targetId
  );
  apply(() =>
    moveAnalysisChapter(props.source.chapters, sourceId, targetIndex)
  );
}

async function splitSelected(): Promise<void> {
  const chapter = selected.value;
  const cursor = preview.value?.selectionStart;
  if (!chapter || cursor === undefined) return;
  apply(() => splitAnalysisChapter(props.source.chapters, chapter.id, cursor));
  await nextTick();
}

function merge(direction: "previous" | "next"): void {
  const chapter = selected.value;
  if (!chapter) return;
  apply(() =>
    mergeAnalysisChapter(props.source.chapters, chapter.id, direction)
  );
}
</script>

<template>
  <section class="chapter-editor analysis-card">
    <header class="analysis-card-heading">
      <div>
        <p class="analysis-eyebrow">
          {{ t("importAndCorrect") }}
        </p>
        <h2>{{ source.name }}</h2>
      </div>
      <span>{{
        t("chapterCount", {
          count: source.chapters.length.toLocaleString(locale)
        })
      }}</span>
    </header>

    <div v-if="source.diagnostics.length" class="analysis-diagnostics">
      <p
        v-for="diagnostic in source.diagnostics"
        :key="`${diagnostic.code}:${diagnostic.sourceName ?? ''}`"
      >
        {{ diagnostic.message }}
      </p>
    </div>

    <div class="chapter-editor-grid">
      <div class="chapter-list-pane">
        <div class="chapter-page-bar">
          <button type="button" :disabled="page <= 1" @click="page -= 1">
            {{ t("previousPage") }}
          </button>
          <span>{{ page }} / {{ pageCount }}</span>
          <button
            type="button"
            :disabled="page >= pageCount"
            @click="page += 1"
          >
            {{ t("nextPage") }}
          </button>
        </div>
        <ol class="chapter-list">
          <li
            v-for="chapter in visibleChapters"
            :key="chapter.id"
            :class="{ 'is-selected': chapter.id === selectedId }"
            :draggable="!disabled"
            @dragstart="draggedId = chapter.id"
            @dragover.prevent
            @drop="dropOn(chapter.id)"
          >
            <button
              class="chapter-select"
              type="button"
              @click="selectChapter(chapter)"
            >
              <AppIcon name="more" :size="13" />
              <span>{{ chapter.order }}</span>
            </button>
            <input
              :value="chapter.title"
              :disabled="disabled"
              :aria-label="t('chapterTitle')"
              @change="rename(chapter, $event)"
            />
            <small>{{
              t("characterCount", {
                count: chapter.charCount.toLocaleString(locale)
              })
            }}</small>
            <button
              type="button"
              :disabled="disabled || chapter.order <= 1"
              :aria-label="t('moveChapterUp')"
              @click="move(chapter.id, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              :disabled="disabled || chapter.order >= source.chapters.length"
              :aria-label="t('moveChapterDown')"
              @click="move(chapter.id, 1)"
            >
              ↓
            </button>
            <button
              class="chapter-delete-button"
              type="button"
              :disabled="disabled || source.chapters.length <= 1"
              :aria-label="t('deleteChapter')"
              :title="
                source.chapters.length <= 1
                  ? t('keepOneChapter')
                  : t('deleteChapter')
              "
              @click="remove(chapter.id)"
            >
              <AppIcon name="trash" :size="16" />
            </button>
          </li>
        </ol>
      </div>

      <div v-if="selected" class="chapter-preview-pane">
        <div class="chapter-preview-meta">
          <div>
            <strong>{{ selected.title }}</strong>
            <small
              >{{ selected.volume || t("unassignedVolume") }} ·
              {{ selected.sourceName }}</small
            >
          </div>
          <div class="chapter-edit-actions">
            <button
              type="button"
              :disabled="disabled || selected.order <= 1"
              @click="merge('previous')"
            >
              {{ t("mergeIntoPrevious") }}
            </button>
            <button
              type="button"
              :disabled="disabled || selected.order >= source.chapters.length"
              @click="merge('next')"
            >
              {{ t("mergeNextChapter") }}
            </button>
            <button
              class="analysis-primary-button"
              type="button"
              :disabled="disabled"
              @click="splitSelected"
            >
              {{ t("splitAtCursor") }}
            </button>
          </div>
        </div>
        <textarea
          ref="preview"
          :value="selected.text"
          readonly
          :aria-label="t('chapterPreview')"
        />
        <p class="analysis-help">
          {{ t("chapterCorrectionHelp") }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chapter-editor {
  min-height: 460px;
}
.chapter-editor-grid {
  display: grid;
  grid-template-columns: minmax(290px, 0.8fr) minmax(360px, 1.2fr);
  gap: 14px;
  min-height: 390px;
}
.chapter-list-pane,
.chapter-preview-pane {
  min-width: 0;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-main);
}
.chapter-page-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 10px;
  border-bottom: 1px solid var(--theme-line-soft);
  color: var(--text-secondary);
}
.chapter-page-bar button,
.chapter-edit-actions button,
.chapter-list li > button {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.chapter-list {
  max-height: 420px;
  overflow: auto;
  margin: 0;
  padding: 6px;
  list-style: none;
}
.chapter-list li {
  display: grid;
  grid-template-columns: 46px minmax(120px, 1fr) auto repeat(3, 28px);
  gap: 5px;
  align-items: center;
  margin: 2px 0;
  padding: 5px;
  border-radius: 8px;
}
.chapter-list li.is-selected {
  background: var(--surface-selected);
}
.chapter-list .chapter-delete-button {
  padding: 0;
}
.chapter-list input {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
}
.chapter-list small {
  color: var(--text-tertiary);
  white-space: nowrap;
}
.chapter-select {
  display: flex;
  align-items: center;
  gap: 5px;
}
.chapter-preview-pane {
  display: flex;
  flex-direction: column;
  padding: 12px;
}
.chapter-preview-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.chapter-preview-meta > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.chapter-preview-meta small {
  overflow: hidden;
  color: var(--text-tertiary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chapter-edit-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.chapter-edit-actions button {
  padding: 6px 9px;
  border-radius: 8px;
  background: var(--surface-muted);
}
.chapter-preview-pane textarea {
  flex: 1;
  min-height: 300px;
  resize: none;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface-muted);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.7;
}
.analysis-help {
  margin: 8px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
@media (max-width: 980px) {
  .chapter-editor-grid {
    grid-template-columns: 1fr;
  }
  .chapter-list {
    max-height: 260px;
  }
}
</style>
