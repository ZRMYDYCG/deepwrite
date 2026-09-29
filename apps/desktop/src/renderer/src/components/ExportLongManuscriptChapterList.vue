<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import {
  groupLongManuscriptExportChapters,
  type LongManuscriptExportChapterOption
} from "../utils/longManuscriptExportChapters";

const t = createScopedTranslator("components.exportLongManuscriptChapterList");

const props = defineProps<{
  chapters: readonly LongManuscriptExportChapterOption[];
  selectedIds: readonly string[];
  loading?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:selectedIds": [ids: string[]];
}>();

const groups = computed(() =>
  groupLongManuscriptExportChapters(props.chapters)
);
const selected = computed(() => new Set(props.selectedIds));
const allSelected = computed(
  () =>
    props.chapters.length > 0 &&
    props.chapters.every((chapter) => selected.value.has(chapter.id))
);

function setSelected(ids: Iterable<string>): void {
  emit("update:selectedIds", [...new Set(ids)]);
}

function toggleAll(): void {
  if (props.disabled || props.loading) return;
  setSelected(allSelected.value ? [] : props.chapters.map(({ id }) => id));
}

function volumeSelected(
  chapters: readonly LongManuscriptExportChapterOption[]
): boolean {
  return (
    chapters.length > 0 &&
    chapters.every((chapter) => selected.value.has(chapter.id))
  );
}

function volumePartial(
  chapters: readonly LongManuscriptExportChapterOption[]
): boolean {
  const count = chapters.filter((chapter) =>
    selected.value.has(chapter.id)
  ).length;
  return count > 0 && count < chapters.length;
}

function toggleVolume(
  chapters: readonly LongManuscriptExportChapterOption[]
): void {
  if (props.disabled || props.loading) return;
  const volumeIds = chapters.map(({ id }) => id);
  if (volumeSelected(chapters)) {
    const removing = new Set(volumeIds);
    setSelected(props.selectedIds.filter((id) => !removing.has(id)));
    return;
  }
  setSelected([...props.selectedIds, ...volumeIds]);
}

function toggleChapter(chapterId: string): void {
  if (props.disabled || props.loading) return;
  if (selected.value.has(chapterId)) {
    setSelected(props.selectedIds.filter((id) => id !== chapterId));
    return;
  }
  setSelected([...props.selectedIds, chapterId]);
}
</script>

<template>
  <fieldset class="export-long-chapters">
    <legend>
      {{ t("selectManuscriptChapters") }}
    </legend>
    <div class="export-long-chapters-toolbar">
      <span>{{
        t("chaptersMessage", {
          arg0: selectedIds.length ?? "",
          arg1: chapters.length ?? ""
        })
      }}</span>
      <button
        class="export-long-chapters-toggle"
        type="button"
        :disabled="disabled || loading || chapters.length === 0"
        @click="toggleAll"
      >
        {{ allSelected ? t("deselectAll") : t("selectAll") }}
      </button>
    </div>
    <p v-if="loading" class="export-long-chapters-status">
      {{ t("loadingChapters") }}
    </p>
    <p v-else-if="chapters.length === 0" class="export-long-chapters-status">
      {{ t("thisBookHasNoManuscriptChaptersToExportYet") }}
    </p>
    <div v-else class="export-long-chapter-groups" role="group">
      <section
        v-for="group in groups"
        :key="group.volumeId"
        class="export-long-chapter-group"
      >
        <label class="export-long-volume-row">
          <input
            type="checkbox"
            :checked="volumeSelected(group.chapters)"
            :indeterminate="volumePartial(group.chapters)"
            :disabled="disabled || loading"
            :aria-label="
              t('selectAllChaptersInValue', { arg0: group.volumeTitle })
            "
            @change="toggleVolume(group.chapters)"
          />
          <strong>{{ group.volumeTitle }}</strong>
          <small>{{
            t("chaptersMessageDetail", { arg0: group.chapters.length ?? "" })
          }}</small>
        </label>
        <label
          v-for="chapter in group.chapters"
          :key="chapter.id"
          class="export-long-chapter-row"
        >
          <input
            type="checkbox"
            :checked="selected.has(chapter.id)"
            :disabled="disabled || loading"
            :value="chapter.id"
            @change="toggleChapter(chapter.id)"
          />
          <span>{{ chapter.title }}</span>
        </label>
      </section>
    </div>
  </fieldset>
</template>

<style scoped>
.export-long-chapters {
  display: grid;
  gap: 9px;
  min-width: 0;
  padding: 0;
  border: 0;
}
.export-long-chapters legend {
  color: var(--text-primary);
  font-size: 0.785714rem;
  font-weight: 620;
}
.export-long-chapters-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.export-long-chapters-toggle {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
}
.export-long-chapters-toggle:disabled {
  color: var(--text-tertiary);
  cursor: default;
}
.export-long-chapters-status {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.75rem;
  line-height: 1.65;
}
.export-long-chapter-groups {
  display: grid;
  gap: 8px;
  max-height: 240px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  background: var(--surface-muted);
}
.export-long-chapter-group {
  display: grid;
  gap: 4px;
}
.export-long-volume-row,
.export-long-chapter-row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  margin: 0;
  color: var(--text-primary);
  cursor: pointer;
}
.export-long-chapter-row {
  grid-template-columns: 16px minmax(0, 1fr);
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.export-long-volume-row strong {
  min-width: 0;
  font-size: 0.75rem;
  font-weight: 620;
}
.export-long-volume-row small {
  color: var(--text-tertiary);
  font-size: 0.678571rem;
}
.export-long-volume-row input,
.export-long-chapter-row input {
  margin: 0;
  accent-color: var(--accent);
}
</style>
