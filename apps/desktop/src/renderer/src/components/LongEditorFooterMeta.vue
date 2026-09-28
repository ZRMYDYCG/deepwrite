<script setup lang="ts">
import { computed, watch } from "vue";
import type { LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";
import type { LongDocumentState } from "../composables/useLongEditorDocumentSession";
import type { LongWorkspaceSelectionFile } from "../types/longWorkspace";
import { countNonWhitespaceCharacters } from "../utils/boundedTextHistory";

const props = defineProps<{
  bookId: string;
  workspaceIndex: LongWorkspaceIndexSnapshot | null;
  bodyFileId: string | undefined;
  characterCount: number;
  documentStates: Record<string, LongDocumentState>;
  ensureDocumentsLoaded: (
    files: LongWorkspaceSelectionFile[]
  ) => Promise<boolean>;
  autoSaveEnabled: boolean;
}>();
const volumeFiles = computed(() => {
  const index = props.workspaceIndex;
  if (!props.bodyFileId || !index) return null;
  const chapter = index.chapters.find(
    ({ body }) => body.id === props.bodyFileId
  );
  const card = index.plot.chapterCards.find(
    ({ id }) => id === chapter?.chapterCardId
  );
  if (!card) return null;
  const ids = new Set(
    index.plot.chapterCards
      .filter(({ volumeId }) => volumeId === card.volumeId)
      .map(({ id }) => id)
  );
  return index.chapters
    .filter(({ chapterCardId }) => ids.has(chapterCardId))
    .map(({ body }) => body);
});
const pendingFiles = computed(() =>
  (volumeFiles.value ?? []).filter((file) => {
    const state = props.documentStates[`${props.bookId}\u0000${file.id}`];
    return (
      !state?.loading &&
      !state?.loadError &&
      (!state?.loaded ||
        (state.file.updatedAt !== file.updatedAt &&
          state.content === state.savedContent))
    );
  })
);
watch(
  pendingFiles,
  (files) => {
    if (files.length)
      void props
        .ensureDocumentsLoaded(
          files.map((file) => ({ role: "body", label: "正文", file }))
        )
        .catch(() => {});
  },
  { immediate: true }
);
const volumeCount = computed(() => {
  if (!volumeFiles.value) return null;
  let total = 0;
  for (const file of volumeFiles.value) {
    const state = props.documentStates[`${props.bookId}\u0000${file.id}`];
    if (!state?.loaded) return null;
    total += countNonWhitespaceCharacters(state.content);
  }
  return total;
});
const loadFailed = computed(() =>
  volumeFiles.value?.some(
    (file) => props.documentStates[`${props.bookId}\u0000${file.id}`]?.loadError
  )
);
</script>
<template>
  <span class="long-footer-meta">
    {{ characterCount.toLocaleString("zh-CN") }} 字
    <template v-if="bodyFileId">
      · 本卷
      {{
        volumeCount === null
          ? loadFailed
            ? "字数暂不可用"
            : "统计中…"
          : `${volumeCount.toLocaleString("zh-CN")} 字`
      }}</template
    >
    · 自动保存{{ autoSaveEnabled ? "开启" : "关闭" }}
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
