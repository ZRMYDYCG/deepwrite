<script setup lang="ts">
import { createScopedTranslator } from "../i18n";

const t = createScopedTranslator("components.longWorkspacePanePlaceholder");
withDefaults(
  defineProps<{
    kind: "agent" | "editor";
    rightPane?: boolean;
    loading?: boolean;
  }>(),
  { rightPane: true, loading: true }
);
</script>

<template>
  <section
    class="long-workspace-pane-placeholder"
    :class="{
      'is-editor': kind === 'editor',
      'is-center': kind === 'editor' && !rightPane
    }"
    :aria-busy="loading"
    :aria-label="kind === 'editor' ? t('novelFileEditor') : t('novelAgent')"
  >
    <div class="placeholder-header" aria-hidden="true">
      <span class="placeholder-line" />
    </div>
    <div
      v-if="kind === 'editor'"
      class="placeholder-toolbar"
      aria-hidden="true"
    >
      <span class="placeholder-line" />
    </div>
    <div class="placeholder-body" role="status">
      <span v-if="kind === 'editor'">
        {{
          loading
            ? t("openingNovelWorkspace")
            : t("theNovelWorkspaceHasNotLoadedSelectTheBook")
        }}
      </span>
    </div>
    <div class="placeholder-footer" aria-hidden="true">
      <span class="placeholder-line" />
    </div>
  </section>
</template>

<style scoped>
.long-workspace-pane-placeholder {
  display: grid;
  grid-template-rows: minmax(50px, auto) minmax(0, 1fr) minmax(36px, auto);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-main);
  color: var(--text-tertiary);
}

.long-workspace-pane-placeholder.is-editor {
  grid-column: 3;
  grid-row: 1;
  grid-template-rows:
    minmax(50px, auto) minmax(40px, auto) minmax(0, 1fr)
    minmax(36px, auto);
  border-left: 1px solid var(--theme-line);
}

.long-workspace-pane-placeholder.is-center {
  grid-column: 2;
  border-left: 0;
}

.placeholder-header,
.placeholder-toolbar,
.placeholder-footer {
  display: flex;
  align-items: center;
  padding: 8px 15px;
  background: var(--surface-raised);
}

.placeholder-header,
.placeholder-toolbar {
  border-bottom: 1px solid var(--theme-line-soft);
}

.placeholder-footer {
  border-top: 1px solid var(--theme-line-soft);
}

.placeholder-line {
  width: min(35%, 140px);
  height: 0.65rem;
  border-radius: 4px;
  background: var(--surface-muted);
}

.placeholder-body {
  display: grid;
  place-content: center;
  min-height: 0;
  padding: 16px;
  overflow: auto;
  font-size: 0.857143rem;
  text-align: center;
}

:global(html[data-platform="darwin"]) .placeholder-header {
  min-height: 52px;
}
</style>
