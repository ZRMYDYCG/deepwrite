<script setup lang="ts">
import { presetLabel } from "../analysis-ui/preset-labels";
import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import { computed, ref, watch } from "vue";
import PopupSelect, {
  type PopupSelectOption
} from "../../components/PopupSelect.vue";
import { uiMessage } from "../../ui-feedback";
import LongAnalysisRunControls from "./LongAnalysisRunControls.vue";
import { analysisOutputTypeLabel } from "./task-options";
import type { LongBookAnalysisController } from "./useLongBookAnalysis";

const t = createScopedTranslator("extras.longBookAnalysis");
const props = defineProps<{
  controller: LongBookAnalysisController;
}>();
defineEmits<{ showResult: [] }>();
const selectedPresetId = ref("");
const startOrder = ref(1);
const endOrder = ref(1);

const source = computed(() => props.controller.source.value);
const presets = computed(() => props.controller.presets.value);
const selectedPreset = computed(
  () =>
    presets.value.find((preset) => preset.id === selectedPresetId.value) ?? null
);
const presetOptions = computed<PopupSelectOption[]>(() =>
  presets.value.map((preset) => ({
    value: preset.id,
    label: presetLabel(preset),
    description: presetLabel(preset, "description")
  }))
);
const outputTypeLabel = computed(() =>
  analysisOutputTypeLabel(selectedPreset.value)
);
const selectionCount = computed(() =>
  Math.max(0, endOrder.value - startOrder.value + 1)
);

watch(
  presets,
  (next) => {
    if (!next.some((preset) => preset.id === selectedPresetId.value)) {
      selectedPresetId.value = next[0]?.id ?? "";
    }
  },
  { immediate: true }
);

watch(
  source,
  (next, previous) => {
    if (!next) return;
    if (next.id !== previous?.id) {
      startOrder.value = 1;
      endOrder.value = Math.min(50, next.chapters.length);
    } else normalizeRange("start");
  },
  { immediate: true }
);

function normalizeRange(anchor: "start" | "end"): void {
  const maximum = source.value?.chapters.length ?? 1;
  startOrder.value = Math.max(
    1,
    Math.min(maximum, Math.round(startOrder.value || 1))
  );
  endOrder.value = Math.max(
    1,
    Math.min(maximum, Math.round(endOrder.value || 1))
  );
  if (anchor === "start") {
    endOrder.value = Math.max(
      startOrder.value,
      Math.min(endOrder.value, startOrder.value + 49)
    );
  } else {
    startOrder.value = Math.min(
      endOrder.value,
      Math.max(startOrder.value, endOrder.value - 49)
    );
  }
}

async function start(): Promise<void> {
  try {
    await props.controller.start({
      presetId: selectedPresetId.value,
      startOrder: startOrder.value,
      endOrder: endOrder.value,
      modelId: props.controller.selectedModelId.value,
      thinkingLevel: props.controller.selectedThinkingLevel.value
    });
  } catch (error: unknown) {
    uiMessage.warning(formatError(error, t("cannotStartAnalysis")));
  }
}
</script>
<template>
  <section class="analysis-card setup-card">
    <header class="analysis-card-heading">
      <div>
        <p class="analysis-eyebrow">
          {{ t("analysisTask") }}
        </p>
        <h2>{{ t("chooseRangePreset") }}</h2>
      </div>
    </header>
    <div class="setup-grid">
      <div class="setup-field setup-range-field">
        <span class="setup-field-label"
          >{{ t("chapterRange")
          }}<small>{{ t("maxFiftyChapters") }}</small></span
        >
        <div class="chapter-range-inputs">
          <input
            v-model.number="startOrder"
            type="number"
            :aria-label="t('startChapter')"
            min="1"
            :max="source?.chapters.length ?? 1"
            :disabled="!source || controller.isBusy.value"
            @change="normalizeRange('start')"
          />
          <span>{{ t("to") }}</span>
          <input
            v-model.number="endOrder"
            type="number"
            :aria-label="t('endChapter')"
            min="1"
            :max="source?.chapters.length ?? 1"
            :disabled="!source || controller.isBusy.value"
            @change="normalizeRange('end')"
          />
        </div>
      </div>
      <label class="setup-field"
        ><span class="setup-field-label">{{ t("analysisPreset") }}</span
        ><PopupSelect
          v-model="selectedPresetId"
          :options="presetOptions"
          :accessible-label="t('analysisPreset')"
          :disabled="controller.isBusy.value"
          :menu-min-width="280"
      /></label>
    </div>
    <div v-if="selectedPreset" class="preset-summary">
      <div class="preset-summary-main">
        <div class="preset-summary-copy">
          <strong>{{ presetLabel(selectedPreset) }}</strong>
          <span>{{ presetLabel(selectedPreset, "description") }}</span>
        </div>
        <small>
          {{
            selectedPreset.output.domain === "material"
              ? t("materialEntry")
              : t("skillEntry")
          }}
          · {{ outputTypeLabel }}
        </small>
      </div>
    </div>
    <LongAnalysisRunControls
      :controller="controller"
      :selection-count="selectionCount"
      :can-start="
        !!source &&
        !!selectedPreset &&
        !!controller.selectedModelId.value &&
        selectionCount >= 1 &&
        selectionCount <= 50
      "
      @start="start"
      @show-result="$emit('showResult')"
    />
  </section>
</template>
