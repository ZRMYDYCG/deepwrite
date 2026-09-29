<script setup lang="ts">
import { presetLabel } from "../analysis-ui/preset-labels";
import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  ShortBookAnalysisPresetSchema,
  type CatalogSnapshot,
  type LongBookAnalysisPreset,
  type ModelConfig
} from "@deepwrite/contracts/renderer";
import PopupSelect from "../../components/PopupSelect.vue";
import { uiMessage } from "../../ui-feedback";
import PresetManager from "../long-book-analysis/PresetManager.vue";
import AnalysisRunStatus from "../analysis-ui/AnalysisRunStatus.vue";
import AnalysisPageShell from "../analysis-ui/AnalysisPageShell.vue";
import AnalysisModelSettings from "../analysis-ui/AnalysisModelSettings.vue";
import AnalysisRefreshButton from "../analysis-ui/AnalysisRefreshButton.vue";
import ShortAnalysisSourceControls from "./ShortAnalysisSourceControls.vue";
import AnalysisResultPanel from "../long-book-analysis/AnalysisResultPanel.vue";
import { analysisOutputTypeLabel } from "../long-book-analysis/task-options";
import ShortAnalysisSources from "./ShortAnalysisSources.vue";
import type { ShortBookAnalysisController } from "./useShortBookAnalysis";
import "../long-book-analysis/long-book-analysis.css";
import "./short-book-analysis.css";

const t = createScopedTranslator("extras");
const props = defineProps<{
  controller: ShortBookAnalysisController;
  models: readonly ModelConfig[];
  catalogSnapshot: CatalogSnapshot | null;
}>();
const emit = defineEmits<{ refreshCatalog: [] }>();
const c = props.controller;
const managerOpen = ref(false);
const saving = ref(false);
const resultAnchor = ref<HTMLElement | null>(null);
const resetVersion = ref(0);
const model = computed(
  () => props.models.find((m) => m.id === c.selectedModelId.value) ?? null
);
const disabled = computed(() => c.isBusy.value || c.loading.value);
function clearWorkspace(): void {
  c.resetWorkspace();
  resetVersion.value += 1;
}
async function act(action: () => unknown) {
  try {
    await action();
  } catch (error) {
    uiMessage.warning(
      formatError(error, t("revisionAnalysis.operationFailed"))
    );
  }
}
async function savePresets(next: LongBookAnalysisPreset[]) {
  saving.value = true;
  try {
    await c.savePresets(ShortBookAnalysisPresetSchema.array().parse(next));
    managerOpen.value = false;
    uiMessage.success(t("shortBookAnalysis.shortPresetSaved"));
  } catch (error) {
    uiMessage.error(formatError(error, t("shortBookAnalysis.saveFailed")));
  } finally {
    saving.value = false;
  }
}
async function saveResult(input: {
  libraryId: string;
  baseProjectRevision?: number;
}) {
  saving.value = true;
  try {
    await c.persistResult(input);
    emit("refreshCatalog");
    uiMessage.success(t("shortBookAnalysis.analysisSavedToLibrary"));
  } catch (error) {
    uiMessage.error(formatError(error, t("shortBookAnalysis.saveFailed")));
  } finally {
    saving.value = false;
  }
}
watch(
  () => c.status.value,
  async (status) => {
    if (status !== "completed") return;
    await nextTick();
    resultAnchor.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
);
onMounted(() => void act(() => c.loadPresets()));
</script>
<template>
  <AnalysisPageShell
    class="long-book-analysis-page short-book-analysis-page"
    :title="t('shortBookAnalysis.shortStoryAnalysis')"
    :description="t('shortBookAnalysis.shortAnalysisDescription')"
  >
    <template #header-actions>
      <ShortAnalysisSourceControls
        :controller="c"
        :reset-version="resetVersion"
        @manage-presets="managerOpen = true"
      >
        <AnalysisModelSettings
          v-model:model-id="c.selectedModelId.value"
          v-model:thinking-level="c.selectedThinkingLevel.value"
          :models="models"
          :disabled="disabled"
        />
        <AnalysisRefreshButton
          :busy="c.isBusy.value"
          :status="c.status.value"
          :disabled="c.loading.value || saving"
          :stop="c.stop"
          :clear="clearWorkspace"
        />
      </ShortAnalysisSourceControls>
    </template>
    <ShortAnalysisSources :key="resetVersion" :controller="c" />
    <section class="analysis-card setup-card">
      <header class="analysis-card-heading">
        <div>
          <p class="analysis-eyebrow">
            {{ t("longBookAnalysis.analysisTask") }}
          </p>
          <h2>{{ t("shortBookAnalysis.chooseAnalysisPreset") }}</h2>
        </div>
      </header>
      <div class="setup-grid">
        <div class="setup-field setup-range-field">
          <span class="setup-field-label"
            >{{ t("shortBookAnalysis.bookScope")
            }}<small>{{
              t("shortBookAnalysis.determinedByPreset")
            }}</small></span
          >
          <div class="short-selection-summary">
            {{
              c.selectedPreset.value?.selectionMode === "multiple"
                ? t("shortBookAnalysis.multipleJointAnalysis")
                : t("shortBookAnalysis.singleSelectBook")
            }}
          </div>
        </div>
        <label class="setup-field"
          ><span class="setup-field-label">{{
            t("longBookAnalysis.analysisPreset")
          }}</span
          ><PopupSelect
            v-model="c.selectedPresetId.value"
            :options="
              c.presets.value.map((p) => ({
                value: p.id,
                label: presetLabel(p),
                description:
                  p.selectionMode === 'single'
                    ? t('shortBookAnalysis.single')
                    : t('longBookAnalysis.multipleBooksCompact')
              }))
            "
            :accessible-label="t('longBookAnalysis.analysisPreset')"
            :disabled="disabled"
        /></label>
      </div>
      <div v-if="c.selectedPreset.value" class="preset-summary">
        <div class="preset-summary-main">
          <div class="preset-summary-copy">
            <strong>{{ presetLabel(c.selectedPreset.value) }}</strong>
            <span>{{
              presetLabel(c.selectedPreset.value, "description")
            }}</span>
          </div>
          <small
            >{{
              c.selectedPreset.value.output.domain === "material"
                ? t("longBookAnalysis.materialEntry")
                : t("longBookAnalysis.skillEntry")
            }}
            · {{ analysisOutputTypeLabel(c.selectedPreset.value) }}</small
          >
        </div>
      </div>
      <div class="analysis-run-bar">
        <div class="analysis-run-progress">
          <strong>{{
            t("shortBookAnalysis.booksSelected", {
              count: c.selectedIds.value.length
            })
          }}</strong>
          <AnalysisRunStatus
            :status="c.status.value"
            :entries="c.entries.value"
            :current-activity="c.activity.value"
            :live-output="c.liveOutput.value"
            :error="c.error.value"
            :title="t('shortBookAnalysis.shortAnalysisDetails')"
          />
        </div>
        <div class="analysis-run-actions">
          <button
            v-if="c.result.value"
            @click="
              resultAnchor?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              })
            "
          >
            {{ t("longBookAnalysis.viewGeneratedResult") }}</button
          ><button
            v-if="c.isBusy.value"
            :disabled="c.status.value === 'stopping'"
            @click="act(() => c.stop())"
          >
            {{ t("longBookAnalysis.stop") }}</button
          ><button
            v-else
            class="analysis-primary-button"
            :disabled="
              disabled ||
              !c.selectionValid.value ||
              !model ||
              !c.selectedPreset.value
            "
            @click="act(() => c.start())"
          >
            {{
              c.result.value || c.canRetry.value
                ? t("longBookAnalysis.analyzeAgain")
                : t("longBookAnalysis.startAnalysis")
            }}
          </button>
        </div>
      </div>
    </section>
    <div
      v-if="c.result.value && c.resultPreset.value"
      ref="resultAnchor"
      class="analysis-result-anchor"
    >
      <AnalysisResultPanel
        :result="c.result.value"
        :preset="c.resultPreset.value"
        :catalog-snapshot="catalogSnapshot"
        :previous="c.resultIsPrevious.value"
        :context="c.resultContext.value"
        :saving="saving"
        @update="c.result.value = $event"
        @save="saveResult"
      />
    </div>
    <PresetManager
      short
      :open="managerOpen"
      :presets="c.presets.value"
      :saving="saving"
      @close="managerOpen = false"
      @save="savePresets"
      @reset="(id) => act(() => c.resetPresets(id))"
    />
  </AnalysisPageShell>
</template>
