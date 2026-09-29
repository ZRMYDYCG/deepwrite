<script setup lang="ts">
import { formatError } from "../../i18n/errors";
import { createScopedTranslator, locale } from "../../i18n";
import { computed, onMounted } from "vue";
import AppIcon from "../../components/AppIcon.vue";
import PopupSelect, {
  type PopupSelectOption
} from "../../components/PopupSelect.vue";
import { uiMessage } from "../../ui-feedback";
import type { LongBookAnalysisController } from "./useLongBookAnalysis";

const t = createScopedTranslator("extras.longBookAnalysis");

const props = defineProps<{
  controller: LongBookAnalysisController;
}>();
const emit = defineEmits<{
  managePresets: [];
}>();

const importedAtFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      dateStyle: "medium",
      timeStyle: "short"
    })
);
const sourceId = computed(() => props.controller.source.value?.id ?? "");
const savedSourceOptions = computed<PopupSelectOption[]>(() =>
  props.controller.savedSources.value.map((savedSource) => ({
    value: savedSource.id,
    label: savedSource.name,
    description: t("sourceDetails", {
      kind: savedSource.kind === "txt" ? "TXT" : t("chapterFolder"),
      chapters: savedSource.chapterCount.toLocaleString(locale.value),
      characters: savedSource.characterCount.toLocaleString(locale.value),
      date: importedAtFormatter.value.format(new Date(savedSource.importedAt))
    })
  }))
);
const savedSourcePlaceholder = computed(() => {
  if (props.controller.sourcesLoading.value) return t("loadingImportedNovels");
  return savedSourceOptions.value.length > 0
    ? t("chooseImportedNovel")
    : t("noImportedNovels");
});

async function importSource(kind: "txt" | "directory"): Promise<void> {
  try {
    if (await props.controller.chooseSource(kind)) {
      uiMessage.success(
        kind === "txt" ? t("textImported") : t("chapterFolderImported")
      );
    }
  } catch (error: unknown) {
    uiMessage.error(formatError(error, t("sourceImportFailed")));
  }
}

async function loadSavedSource(value: string | number): Promise<void> {
  try {
    if (await props.controller.loadSavedSource(String(value))) {
      uiMessage.success(t("novelLoaded"));
    }
  } catch (error: unknown) {
    uiMessage.error(formatError(error, t("novelLoadFailed")));
  }
}

onMounted(() => {
  void props.controller.loadSavedSources().catch((error: unknown) => {
    uiMessage.error(formatError(error, t("novelLoadFailed")));
  });
});
</script>

<template>
  <div class="analysis-page-controls">
    <div class="analysis-source-picker">
      <PopupSelect
        :model-value="sourceId"
        :options="savedSourceOptions"
        :accessible-label="t('chooseImportedNovel')"
        :placeholder="savedSourcePlaceholder"
        :disabled="
          controller.isBusy.value ||
          controller.sourcesLoading.value ||
          savedSourceOptions.length === 0
        "
        :menu-min-width="320"
        @change="loadSavedSource"
      >
        <template #prefix>
          <AppIcon name="book" :size="15" />
        </template>
      </PopupSelect>
    </div>
    <div class="analysis-page-actions">
      <button
        type="button"
        :disabled="controller.isBusy.value"
        @click="importSource('txt')"
      >
        <AppIcon name="file" :size="16" />{{ t("importTxt") }}
      </button>
      <button
        type="button"
        :disabled="controller.isBusy.value"
        @click="importSource('directory')"
      >
        <AppIcon name="folder" :size="16" />{{ t("chapterFolder") }}
      </button>
      <button
        type="button"
        :title="t('managePresets')"
        :aria-label="t('managePresets')"
        :disabled="controller.isBusy.value"
        @click="emit('managePresets')"
      >
        {{ t("managePresets") }}
      </button>
      <slot />
    </div>
  </div>
</template>
