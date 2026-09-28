<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import type { WorkspaceDocument } from "../types/workspace";
import { catalogBodyTextKind } from "../utils/bodyTextTarget";
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
      {{ characterCount.toLocaleString("zh-CN")
      }}<template v-if="recommendedContentLength">
        / {{ recommendedContentLength.toLocaleString("zh-CN") }}</template
      >
      字
    </span>
    <span
      v-if="isLibraryDocument"
      class="library-entry-limit-hint"
      :class="{ 'limit-warning': contentExceedsRecommendedLength }"
      :title="
        isLibraryOverview
          ? '素材库或技能库介绍建议不超过 40,000 字'
          : '每个素材库或技能库条目建议不超过 40,000 字，请勿上传过多内容'
      "
    >
      {{
        isLibraryOverview
          ? "建议库介绍不超过 40,000 字"
          : "建议每个条目不超过 40,000 字，请勿上传过多内容"
      }}
    </span>
    <CatalogManuscriptCharacterCount
      v-if="isBody"
      :document="document"
      :content="content"
    />
    <span class="editor-save-status"
      >· 自动保存{{ autoSaveEnabled ? "开启" : "关闭" }}</span
    >
  </div>
</template>
