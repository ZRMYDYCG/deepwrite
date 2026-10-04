<script setup lang="ts">
import { computed } from "vue";
import { createScopedTranslator, locale } from "../../i18n";
import type { LongBookDecompositionController } from "./useLongBookDecomposition";
const t = createScopedTranslator("extras.longBookDecomposition");
const props = defineProps<{
  estimate: ReturnType<LongBookDecompositionController["estimate"]> | null;
}>();
const number = (value: number) => value.toLocaleString(locale.value);
const range = (values: readonly number[]) => values.map(number).join("–");
const stats = computed(() => {
  const value = props.estimate;
  if (!value) return [];
  return [
    { label: t("estimateChapters"), value: number(value.chapters) },
    { label: t("estimateCharacters"), value: number(value.characters) },
    { label: t("estimateChunks"), value: number(value.chunks) },
    { label: t("estimateCalls"), value: number(value.calls) },
    { label: t("estimateInput"), value: range(value.inputTokens) },
    { label: t("estimateCached"), value: range(value.cachedInputTokens) },
    { label: t("estimateOutput"), value: range(value.outputTokens) },
    {
      label: t("estimateMinutes"),
      value: t("estimateMinutesValue", { minutes: value.minutes.join("–") })
    }
  ];
});
</script>
<template>
  <section class="decomposition-estimate" :aria-label="t('estimateTitle')">
    <p class="decomposition-estimate-title">{{ t("estimateTitle") }}</p>
    <dl v-if="estimate">
      <div v-for="stat in stats" :key="stat.label">
        <dt>{{ stat.label }}</dt>
        <dd>{{ stat.value }}</dd>
      </div>
    </dl>
    <p v-else class="analysis-help">{{ t("estimateEmpty") }}</p>
    <p class="analysis-help">{{ t("estimateHelp") }}</p>
  </section>
</template>
