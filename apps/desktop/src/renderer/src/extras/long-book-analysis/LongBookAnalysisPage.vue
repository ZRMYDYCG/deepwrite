<script setup lang="ts">
import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import { nextTick, onMounted, ref, watch } from "vue";
import type {
  CatalogSnapshot,
  LongBookAnalysisPreset,
  ModelConfig
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../../ui-feedback";
import AnalysisPageShell from "../analysis-ui/AnalysisPageShell.vue";
import AnalysisModelSettings from "../analysis-ui/AnalysisModelSettings.vue";
import AnalysisRefreshButton from "../analysis-ui/AnalysisRefreshButton.vue";
import AnalysisResultPanel from "./AnalysisResultPanel.vue";
import AnalysisSourceControls from "./AnalysisSourceControls.vue";
import LongAnalysisSourceSummary from "./LongAnalysisSourceSummary.vue";
import LongAnalysisTaskSetup from "./LongAnalysisTaskSetup.vue";
import PresetManager from "./PresetManager.vue";
import type { LongBookAnalysisController } from "./useLongBookAnalysis";
import "./long-book-analysis.css";

const t = createScopedTranslator("extras.longBookAnalysis");
const props = defineProps<{
  controller: LongBookAnalysisController;
  models: readonly ModelConfig[];
  catalogSnapshot: CatalogSnapshot | null;
}>();
const emit = defineEmits<{ refreshCatalog: [] }>();
const presetManagerOpen = ref(false);
const presetSaving = ref(false);
const resultSaving = ref(false);
const resultAnchor = ref<HTMLElement | null>(null);
const resetVersion = ref(0);
function clearWorkspace(): void {
  props.controller.resetWorkspace();
  resetVersion.value += 1;
}
async function showResult(): Promise<void> {
  await nextTick();
  resultAnchor.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

watch(
  () => props.controller.status.value,
  (status) => {
    if (status === "completed" && props.controller.result.value) {
      void showResult();
    }
  }
);

async function savePresets(next: LongBookAnalysisPreset[]): Promise<void> {
  presetSaving.value = true;
  try {
    await props.controller.savePresets(next);
    presetManagerOpen.value = false;
    uiMessage.success(t("presetSaved"));
  } catch (error: unknown) {
    uiMessage.error(formatError(error, t("presetSaveFailed")));
  } finally {
    presetSaving.value = false;
  }
}

async function resetPresets(presetId?: string): Promise<void> {
  try {
    await props.controller.resetPresets(presetId);
    uiMessage.success(
      presetId ? t("defaultPresetRestored") : t("allDefaultsRestored")
    );
  } catch (error: unknown) {
    uiMessage.error(formatError(error, t("restorePresetsFailed")));
  }
}

async function persistResult(input: {
  libraryId: string;
  baseProjectRevision?: number;
}): Promise<void> {
  resultSaving.value = true;
  try {
    await props.controller.persistResult(input);
    emit("refreshCatalog");
    uiMessage.success(t("resultSaved"));
  } catch (error: unknown) {
    uiMessage.error(formatError(error, t("createEntryFailed")));
  } finally {
    resultSaving.value = false;
  }
}

onMounted(() => {
  void props.controller.loadPresets().catch((error: unknown) => {
    uiMessage.error(formatError(error, t("loadPresetsFailed")));
  });
});
</script>
<template>
  <AnalysisPageShell
    :title="t('novelAnalysis')"
    :description="t('novelAnalysisDescription')"
    class="long-book-analysis-page"
  >
    <template #header-actions>
      <AnalysisSourceControls
        :controller="controller"
        @manage-presets="presetManagerOpen = true"
      >
        <AnalysisModelSettings
          v-model:model-id="controller.selectedModelId.value"
          v-model:thinking-level="controller.selectedThinkingLevel.value"
          :models="models"
          :disabled="controller.isBusy.value"
        />
        <AnalysisRefreshButton
          :busy="controller.isBusy.value"
          :status="controller.status.value"
          :disabled="
            controller.sourcesLoading.value ||
            controller.presetsLoading.value ||
            presetSaving ||
            resultSaving
          "
          :stop="controller.stop"
          :clear="clearWorkspace"
        />
      </AnalysisSourceControls>
    </template>
    <LongAnalysisSourceSummary :key="resetVersion" :controller="controller" />
    <LongAnalysisTaskSetup
      :key="resetVersion"
      :controller="controller"
      @show-result="showResult"
    />
    <div
      v-if="controller.result.value && controller.resultPreset.value"
      ref="resultAnchor"
      class="analysis-result-anchor"
    >
      <AnalysisResultPanel
        :result="controller.result.value"
        :preset="controller.resultPreset.value"
        :catalog-snapshot="catalogSnapshot"
        :saving="resultSaving"
        :previous="controller.resultIsPrevious.value"
        :context="controller.resultContext.value"
        @update="controller.result.value = $event"
        @save="persistResult"
      />
    </div>
    <PresetManager
      :open="presetManagerOpen"
      :presets="controller.presets.value"
      :saving="presetSaving"
      @close="presetManagerOpen = false"
      @save="savePresets"
      @reset="resetPresets"
    />
  </AnalysisPageShell>
</template>
