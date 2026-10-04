<script setup lang="ts">
import { computed } from "vue";
import { createScopedTranslator, locale } from "../../i18n";
import { normalizeChapterRange } from "./range-input";
import type { LongBookDecompositionController } from "./useLongBookDecomposition";
const t = createScopedTranslator("extras.longBookDecomposition");
const props = defineProps<{
  controller: Pick<
    LongBookDecompositionController,
    "source" | "sourceDirty" | "sourceSaving" | "confirmation"
  >;
  disabled: boolean;
}>();
const range = defineModel<{ start: number; end: number }>("range", {
  required: true
});
const emit = defineEmits<{ save: []; confirm: [] }>();
const total = computed(
  () => props.controller.source.value?.chapters.length ?? 1
);
const locked = computed(
  () => props.disabled || props.controller.sourceSaving.value
);
const state = computed(() => {
  if (props.controller.confirmation.value)
    return { tone: "success", label: t("stateConfirmed") };
  if (props.controller.sourceDirty.value)
    return { tone: "warning", label: t("stateUnsaved") };
  return { tone: "neutral", label: t("statePending") };
});

function normalize(anchor: "start" | "end"): void {
  range.value = normalizeChapterRange(range.value, total.value, anchor);
}
function edit(side: "start" | "end", value: unknown): void {
  range.value = { ...range.value, [side]: value };
}
</script>
<template>
  <section class="analysis-card setup-card decomposition-range">
    <header class="analysis-card-heading">
      <div>
        <p class="analysis-eyebrow">{{ t("sourceEyebrow") }}</p>
        <h2>{{ t("source") }}</h2>
      </div>
      <span class="decomposition-pill" :class="`is-${state.tone}`">{{
        state.label
      }}</span>
    </header>
    <div class="setup-grid">
      <div class="setup-field setup-range-field">
        <span class="setup-field-label"
          >{{ t("range")
          }}<small>{{
            t("rangeTotal", { count: total.toLocaleString(locale) })
          }}</small></span
        >
        <div class="chapter-range-inputs">
          <input
            :value="range.start"
            type="number"
            min="1"
            :max="total"
            :aria-label="t('startOrder')"
            :disabled="locked"
            @input="edit('start', ($event.target as HTMLInputElement).value)"
            @change="normalize('start')"
          />
          <span>{{ t("rangeTo") }}</span>
          <input
            :value="range.end"
            type="number"
            :min="range.start"
            :max="total"
            :aria-label="t('endOrder')"
            :disabled="locked"
            @input="edit('end', ($event.target as HTMLInputElement).value)"
            @change="normalize('end')"
          />
        </div>
      </div>
    </div>
    <div class="analysis-run-bar">
      <p class="analysis-help decomposition-run-hint">{{ t("rangeHelp") }}</p>
      <div class="analysis-run-actions">
        <button type="button" :disabled="locked" @click="emit('save')">
          {{ t("saveSource") }}
        </button>
        <button
          type="button"
          class="analysis-primary-button"
          :disabled="locked"
          @click="emit('confirm')"
        >
          {{ t("confirm") }}
        </button>
      </div>
    </div>
  </section>
</template>
