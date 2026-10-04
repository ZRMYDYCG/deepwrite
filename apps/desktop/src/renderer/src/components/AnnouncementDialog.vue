<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { createScopedTranslator } from "../i18n";
import { formatError } from "../i18n/errors";
import { uiMessage } from "../ui-feedback";
import StartupAlertDialog from "./StartupAlertDialog.vue";

const t = createScopedTranslator("components.sidebarProfileMenu");
const emit = defineEmits<{ close: [] }>();
const messages = ref<string[]>([]);
const loading = ref(true);
const emptyText = computed(() =>
  loading.value ? t("loadingAnnouncements") : t("noAnnouncements")
);
let disposed = false;

onMounted(async () => {
  try {
    const api = window.deepwrite?.appAlerts;
    if (!api) throw new Error(t("couldNotLoadAnnouncements"));
    const snapshot = await api.get();
    if (!disposed) messages.value = [...snapshot.desktopMessages];
  } catch (error: unknown) {
    if (!disposed) {
      uiMessage.error(formatError(error, t("couldNotLoadAnnouncements")));
      emit("close");
    }
  } finally {
    if (!disposed) loading.value = false;
  }
});

onBeforeUnmount(() => {
  disposed = true;
});
</script>

<template>
  <StartupAlertDialog
    :open="true"
    :messages="messages"
    :title="t('announcements')"
    :empty-text="emptyText"
    :loading="loading"
    @close="emit('close')"
  />
</template>
