<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import type { SyncAdoptionSide } from "@deepwrite/contracts/renderer";

const t = createScopedTranslator("extras.deviceSync");
defineProps<{ pending: boolean; all?: boolean; title?: string }>();
const emit = defineEmits<{ resolve: [side: SyncAdoptionSide] }>();
</script>
<template>
  <button
    class="sync-button secondary"
    :disabled="pending"
    :aria-label="title ? t('useRemoteItem', { title: title }) : undefined"
    @click="emit('resolve', 'remote')"
  >
    {{ all ? t("useAllRemote") : t("useRemote") }}
  </button>
  <button
    class="sync-button secondary"
    :disabled="pending"
    :aria-label="title ? t('useLocalItem', { title: title }) : undefined"
    @click="emit('resolve', 'local')"
  >
    {{ all ? t("useAllLocal") : t("useLocal") }}
  </button>
</template>
