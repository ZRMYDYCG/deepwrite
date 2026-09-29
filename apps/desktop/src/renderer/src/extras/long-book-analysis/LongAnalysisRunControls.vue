<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import AnalysisRunStatus from "../analysis-ui/AnalysisRunStatus.vue";
import type { LongBookAnalysisController } from "./useLongBookAnalysis";

const t = createScopedTranslator("extras.longBookAnalysis");

defineProps<{
  controller: LongBookAnalysisController;
  selectionCount: number;
  canStart: boolean;
}>();
defineEmits<{ start: []; showResult: [] }>();
</script>

<template>
  <div class="analysis-run-bar">
    <div class="analysis-run-progress">
      <strong>{{
        t("selectedChapterCount", {
          count: selectionCount
        })
      }}</strong>
      <AnalysisRunStatus
        :status="controller.status.value"
        :entries="controller.processEntries.value"
        :current-activity="controller.currentActivity.value"
        :live-output="controller.liveOutput.value"
        :error="controller.error.value"
        :progress-text="controller.progressText.value"
        :title="t('novelAnalysisProcess')"
      />
    </div>
    <div class="analysis-run-actions">
      <button
        v-if="controller.result.value"
        type="button"
        @click="$emit('showResult')"
      >
        {{ t("viewGeneratedResult") }}
      </button>
      <button
        v-if="controller.canRetry.value"
        type="button"
        @click="controller.retry"
      >
        {{ t("continueIncompletePhase") }}
      </button>
      <button
        v-if="controller.isBusy.value"
        type="button"
        :disabled="controller.status.value === 'stopping'"
        @click="controller.stop"
      >
        {{ t("stop") }}
      </button>
      <button
        v-else
        class="analysis-primary-button"
        type="button"
        :disabled="!canStart"
        @click="$emit('start')"
      >
        {{
          controller.result.value || controller.canRetry.value
            ? t("analyzeAgain")
            : t("startAnalysis")
        }}
      </button>
    </div>
  </div>
</template>
