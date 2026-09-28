<script setup lang="ts">
import { computed, inject } from "vue";
import type { WorkspaceDocument } from "../types/workspace";
import { SHORT_MANUSCRIPT_PREVIEW_KEY } from "../composables/shortManuscriptPreviewContext";
import { useShortManuscriptCharacterCount } from "../composables/useShortManuscriptCharacterCount";
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
    "读取全文字数失败，请重新打开作品后重试。"
  );
</script>
<template>
  <span
    >· 全文
    {{
      totalCount === null
        ? loading
          ? "统计中…"
          : "字数暂不可用"
        : `${totalCount.toLocaleString("zh-CN")} 字`
    }}</span
  >
</template>
