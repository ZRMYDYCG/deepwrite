<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import { computed } from "vue";
import type { SyncKind, SyncStatus } from "@deepwrite/contracts/renderer";

const t = createScopedTranslator("extras");

const props = defineProps<{
  items: SyncStatus["items"];
  pending: boolean;
}>();
const emit = defineEmits<{ toggle: [key: string, included: boolean] }>();
const categories: { title: string; kinds: SyncKind[] }[] = [
  {
    get title() {
      return t("cloudBackup.workspace");
    },
    kinds: ["book", "long-book"]
  },
  {
    get title() {
      return t("cloudBackup.skillLibrary");
    },
    kinds: ["skill-library", "skill-group"]
  },
  {
    get title() {
      return t("cloudBackup.materialLibrary");
    },
    kinds: ["material-library", "material-group"]
  }
];
const groups = computed(() =>
  categories.map((category) => {
    const items = props.items.filter((item) =>
      category.kinds.includes(item.kind)
    );
    return {
      title: category.title,
      items,
      included: items.filter((item) => item.included).length
    };
  })
);
function changeIncluded(key: string, event: Event) {
  if (event.target instanceof HTMLInputElement)
    emit("toggle", key, event.target.checked);
}
</script>

<template>
  <section class="sync-card sync-content-panel">
    <h2>{{ t("deviceSync.syncContents") }}</h2>
    <p>{{ t("deviceSync.scopeDescription") }}</p>
    <section
      v-for="group in groups"
      :key="group.title"
      class="sync-content-group"
      :aria-label="group.title"
    >
      <header class="sync-content-heading">
        <h3>{{ group.title }}</h3>
        <span>{{
          t("deviceSync.enabledCount", {
            enabled: group.included,
            total: group.items.length
          })
        }}</span>
      </header>
      <label v-for="item in group.items" :key="item.key" class="sync-list-row">
        <span>
          {{ item.title }}
          <small>{{
            !item.included
              ? t("deviceSync.syncPaused")
              : item.dirty && item.remoteDirty
                ? t("deviceSync.bothChanged")
                : item.dirty
                  ? t("deviceSync.awaitingUpload")
                  : item.remoteDirty
                    ? t("deviceSync.awaitingDownload")
                    : t("deviceSync.synced")
          }}</small>
        </span>
        <input
          type="checkbox"
          :checked="item.included"
          :disabled="pending"
          :aria-label="t('deviceSync.syncItem', { title: item.title })"
          @change="changeIncluded(item.key, $event)"
        />
      </label>
      <p v-if="!group.items.length" class="sync-content-empty">
        {{ t("deviceSync.noSyncableContent", { category: group.title }) }}
      </p>
    </section>
  </section>
</template>

<style scoped>
.sync-content-group {
  min-width: 0;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  overflow: hidden;
}
.sync-content-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 12px 16px;
  background: var(--surface-muted);
}
.sync-content-heading h3 {
  font-size: 1em;
  line-height: 1.5;
}
.sync-content-heading > span {
  font-size: 0.875em;
  color: var(--text-secondary);
}
.sync-content-group .sync-list-row {
  margin: 0 16px;
  flex-wrap: nowrap;
  gap: 16px;
  cursor: pointer;
}
.sync-content-group .sync-list-row > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.sync-content-group input {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: inherit;
}
.sync-content-group input:disabled {
  cursor: default;
}
.sync-content-group .sync-content-empty {
  margin: 0;
  padding: 16px;
  color: var(--text-secondary);
}
</style>
