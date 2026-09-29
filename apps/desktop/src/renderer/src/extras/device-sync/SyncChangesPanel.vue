<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import { computed, ref } from "vue";
import type {
  SyncAdoptionSide,
  SyncStatus
} from "@deepwrite/contracts/renderer";
import { syncPresentation } from "./presentation";
import SyncAdoptionButtons from "./SyncAdoptionButtons.vue";

const t = createScopedTranslator("extras.deviceSync");
const props = withDefaults(
  defineProps<{ status: SyncStatus; pending?: boolean }>(),
  { pending: false }
);
const emit = defineEmits<{ resolve: [key: string, side: SyncAdoptionSide] }>();
const expanded = ref(false);
const view = computed(() => syncPresentation(props.status));
const first = computed(() =>
  props.status.issues.find((issue) => issue.reason === "first-sync")
);
const groups = computed(() =>
  [
    {
      title: t("localChangesPending"),
      items: view.value.uploads
    },
    {
      title: t("remoteChangesPending"),
      items: view.value.downloads
    },
    {
      title: t("bothChangedChoose"),
      items: view.value.both.filter(
        (item) => !view.value.problems.some((issue) => issue.key === item.key)
      )
    }
  ].filter((group) => group.items.length)
);
</script>
<template>
  <section v-if="!status.firstSyncConfirmed" class="sync-card">
    <h2>{{ t("firstSyncPreview") }}</h2>
    <p>
      {{ first?.message ?? t("firstSyncDescription") }}
    </p>
    <template v-if="first">
      <p>{{ t("firstSyncConfirmationHelp") }}</p>
      <button
        class="sync-button quiet"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{
          expanded
            ? t("collapseFullList")
            : t("viewAllItems", { count: first.paths.length })
        }}
      </button>
      <ul v-if="expanded">
        <li v-for="(title, index) in first.paths" :key="index">{{ title }}</li>
      </ul>
    </template>
  </section>
  <template v-else>
    <section v-for="group in groups" :key="group.title" class="sync-card">
      <h2>{{ group.title }}</h2>
      <div v-for="item in group.items" :key="item.key" class="sync-list-row">
        <span>{{ item.title }}</span>
        <div v-if="item.dirty && item.remoteDirty" class="sync-actions">
          <SyncAdoptionButtons
            :title="item.title"
            :pending="pending"
            @resolve="(side) => emit('resolve', item.key, side)"
          />
        </div>
      </div>
    </section>
    <p v-if="!groups.length && !view.problems.length">
      {{ t("noPendingChanges") }}
    </p>
  </template>
</template>
