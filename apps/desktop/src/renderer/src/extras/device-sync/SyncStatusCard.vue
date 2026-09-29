<script setup lang="ts">
import { createScopedTranslator, locale } from "../../i18n";
import { computed } from "vue";
import { Translation as I18nT } from "vue-i18n";
import type { SyncRequest, SyncStatus } from "@deepwrite/contracts/renderer";
import { syncPresentation } from "./presentation";
import SyncAdoptionButtons from "./SyncAdoptionButtons.vue";
import SyncProgressPanel from "./SyncProgressPanel.vue";
import { syncProgressPresentation } from "./progressPresentation";
import "./sync-status-card.css";

const t = createScopedTranslator("extras.deviceSync");
const props = defineProps<{ status: SyncStatus; pending: boolean }>();
const emit = defineEmits<{ request: [input: SyncRequest] }>();
const view = computed(() => syncPresentation(props.status));
const progress = computed(() =>
  syncProgressPresentation(props.status, props.pending)
);
const first = computed(() =>
  props.status.issues.some((issue) => issue.reason === "first-sync")
);
</script>
<template>
  <section class="sync-card sync-status-card">
    <div class="sync-status-heading">
      <h2>{{ t("syncStatus") }}</h2>
      <span class="sync-status-badge">{{ progress.badge }}</span>
    </div>
    <div class="sync-status-summary">
      <I18nT
        keypath="extras.deviceSync.uploadSummary"
        scope="global"
        tag="span"
        :plural="view.uploads.length"
      >
        <template #count
          ><strong>{{ view.uploads.length }}</strong></template
        >
      </I18nT>
      <I18nT
        keypath="extras.deviceSync.downloadSummary"
        scope="global"
        tag="span"
        :plural="view.downloads.length"
      >
        <template #count
          ><strong>{{ view.downloads.length }}</strong></template
        >
      </I18nT>
      <I18nT
        v-if="view.both.length"
        keypath="extras.deviceSync.bothChangedSummary"
        scope="global"
        tag="span"
        :plural="view.both.length"
      >
        <template #count
          ><strong>{{ view.both.length }}</strong></template
        >
      </I18nT>
    </div>
    <div class="sync-actions">
      <button
        v-if="!status.firstSyncConfirmed"
        class="sync-button"
        :disabled="pending"
        @click="emit('request', { operation: 'sync', confirmFirst: first })"
      >
        {{ first ? t("confirmFirstSync") : t("previewFirstSync") }}
      </button>
      <template v-else>
        <button
          class="sync-button"
          :disabled="pending || !view.uploads.length"
          @click="emit('request', { operation: 'sync', direction: 'upload' })"
        >
          {{ t("uploadLocalChanges") }}
        </button>
        <button
          class="sync-button secondary"
          :disabled="pending || !view.downloads.length"
          @click="emit('request', { operation: 'sync', direction: 'download' })"
        >
          {{ t("downloadRemoteUpdates") }}
        </button>
        <SyncAdoptionButtons
          v-if="view.adoptionKeys.length"
          all
          :pending="pending"
          @resolve="
            (side) =>
              emit('request', {
                operation: 'sync',
                adoption: { side, keys: view.adoptionKeys }
              })
          "
        />
      </template>
      <button
        class="sync-button quiet"
        :disabled="pending"
        @click="emit('request', { operation: 'check' })"
      >
        {{ t("checkRemoteUpdates") }}
      </button>
    </div>
    <p v-if="view.adoptionKeys.length">
      {{ t("resolveIncompleteHelp") }}
    </p>
    <SyncProgressPanel
      :progress="progress"
      :pending="pending"
      @cancel="emit('request', { operation: 'cancel' })"
    />
    <details class="sync-status-records">
      <summary>{{ t("syncRecords") }}</summary>
      <p>
        {{
          status.lastSuccessAt
            ? t("lastSuccess", {
                date: new Date(status.lastSuccessAt).toLocaleString(locale)
              })
            : status.firstSyncConfirmed
              ? t("noFullSuccess")
              : t("firstSyncIncomplete")
        }}
      </p>
      <p v-if="status.firstSyncConfirmed">{{ view.receipt }}</p>
      <p>
        {{
          t("uploadedChangesVisibility", {
            status: status.lastCheckedAt
              ? t("remoteCheckedAt", {
                  date: new Date(status.lastCheckedAt).toLocaleString(locale)
                })
              : t("remoteNotChecked")
          })
        }}
      </p>
    </details>
  </section>
</template>
