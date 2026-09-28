<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    path: string | null;
    loading: boolean;
    embedded?: boolean;
    runtimeAvailable?: boolean;
  }>(),
  { embedded: false, runtimeAvailable: true }
);

const emit = defineEmits<{
  choose: [];
}>();
</script>

<template>
  <section
    class="workspace-settings-panel"
    :class="{ 'is-embedded': embedded }"
  >
    <header v-if="!embedded">
      <div>
        <span class="dialog-eyebrow">DeepWrite</span>
        <h2>工作目录</h2>
      </div>
    </header>

    <div class="dialog-content">
      <p class="dialog-description">
        这里决定以后新建和导入项目的默认位置。切换目录不会移动或影响已经打开的书籍、素材库和技能库。
      </p>
      <div class="directory-card">
        <AppIcon name="directory" :size="20" />
        <div>
          <strong>{{ path ? "当前工作目录" : "尚未选择工作目录" }}</strong>
          <code>{{ path ?? "首次创建或导入时也会提示选择" }}</code>
        </div>
        <span>{{ path ? "已启用" : "待设置" }}</span>
      </div>
      <div class="dialog-note">
        新书和旧版导入保存在 books，新素材库保存在 materials，新技能库保存在
        skills；长篇拆书导入快照保存在 long-book-analysis-sources。项目仍采用
        deepwrite.json + Markdown 文件结构，可由 Git 或同步盘直接管理。
      </div>
      <div class="dialog-actions">
        <button
          class="dialog-primary-button"
          type="button"
          :disabled="loading || !runtimeAvailable"
          @click="emit('choose')"
        >
          {{ loading ? "选择中…" : path ? "切换工作目录" : "选择工作目录" }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workspace-settings-panel.is-embedded {
  width: 100%;
  max-width: 760px;
  min-height: 0;
  border-color: var(--theme-line-soft);
  border-radius: 13px;
  box-shadow: none;
}

.is-embedded .dialog-content {
  min-width: 0;
  padding: 18px;
}

.is-embedded .directory-card code {
  overflow-wrap: anywhere;
  white-space: normal;
}

@media (max-width: 600px) {
  .is-embedded .directory-card {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .is-embedded .directory-card > span {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
