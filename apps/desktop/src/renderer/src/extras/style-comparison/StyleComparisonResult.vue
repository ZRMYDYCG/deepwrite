<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import { computed } from "vue";
import type {
  StyleComparisonResult,
  StyleComparisonDimension
} from "@deepwrite/contracts";
import AppIcon from "../../components/AppIcon.vue";
import { uiMessage } from "../../ui-feedback";
import { similarityLabel } from "./result";

const t = createScopedTranslator("extras");

const props = defineProps<{
  result: StyleComparisonResult | null;
  preview: { summary: string; dimensions: StyleComparisonDimension[] };
  status: string;
  isStale: boolean;
  modelLabel: string;
}>();
const busy = computed(() =>
  ["starting", "running", "stopping"].includes(props.status)
);
const dimensions = computed(
  () => props.result?.dimensions ?? props.preview.dimensions
);
const summary = computed(() => props.result?.summary ?? props.preview.summary);
async function copyResult(): Promise<void> {
  if (!props.result) return;
  const result = props.result;
  const content = [
    t("styleComparison.styleComparison"),
    t("styleComparison.similaritySummary", {
      score: result.score,
      similarity: similarityLabel(result.score)
    }),
    result.summary,
    "",
    ...result.dimensions.map(
      (item) => `${item.name} ${item.score}/100：${item.reason}`
    ),
    "",
    t("styleComparison.keySimilarities"),
    ...result.similarities.map((item) => `- ${item}`),
    "",
    t("styleComparison.mainDifferences"),
    ...result.differences.map((item) => `- ${item}`)
  ].join("\n");
  try {
    await navigator.clipboard.writeText(content);
    uiMessage.success(t("styleComparison.comparisonCopied"));
  } catch {
    uiMessage.error(t("styleComparison.copyFailed"));
  }
}
</script>

<template>
  <div class="comparison-results" :aria-busy="busy">
    <div v-if="status === 'idle' && !result" class="comparison-empty">
      <div class="comparison-empty-mark">
        <AppIcon name="file" :size="24" /><span>≈</span
        ><AppIcon name="file" :size="24" />
      </div>
      <h3>{{ t("styleComparison.comparisonEmptyTitle") }}</h3>
      <p>
        {{ t("styleComparison.comparisonEmptyHelp") }}<br />{{
          t("styleComparison.comparisonEmptyResults")
        }}
      </p>
      <div class="comparison-dimension-tags">
        <span>{{ t("styleComparison.wording") }}</span
        ><span>{{ t("styleComparison.rhythm") }}</span
        ><span>{{ t("styleComparison.narration") }}</span
        ><span>{{ t("styleComparison.rhetoric") }}</span
        ><span>{{ t("styleComparison.tone") }}</span>
      </div>
    </div>
    <template v-else>
      <header class="comparison-result-heading">
        <div>
          <h2>
            {{
              result && isStale
                ? t("styleComparison.lastCompletedAnalysis")
                : t("longBookAnalysis.analysisResult")
            }}
          </h2>
          <p v-if="result && isStale">
            {{
              busy
                ? t("styleComparison.resultUpdatesAfterRun")
                : t("styleComparison.previousAnalysisShown")
            }}
          </p>
          <p v-else-if="!result">
            {{
              busy
                ? t("styleComparison.findingsInProgress")
                : t("styleComparison.incompleteResultAnalyzeAgain")
            }}
          </p>
        </div>
        <small v-if="result">{{ modelLabel }}</small>
      </header>
      <section
        class="comparison-score"
        :class="{ 'is-pending': !result }"
        :aria-label="t('styleComparison.similarityScore')"
      >
        <div>
          <p>
            {{
              isStale
                ? t("styleComparison.previousSimilarity")
                : t("styleComparison.styleSimilarity")
            }}
          </p>
          <div class="comparison-score-number">
            <strong>{{ result ? result.score : "—" }}</strong
            ><span>/ 100</span>
          </div>
        </div>
        <span class="comparison-score-label">{{
          result
            ? similarityLabel(result.score)
            : busy
              ? t("styleComparison.evaluating")
              : t("styleComparison.scoreIncomplete")
        }}</span>
      </section>
      <p v-if="summary" class="comparison-summary">{{ summary }}</p>
      <p v-else class="comparison-waiting">
        {{
          busy
            ? t("styleComparison.readingForFindings")
            : t("styleComparison.incompleteResultCompareAgain")
        }}
      </p>
      <section
        v-if="dimensions.length"
        class="comparison-dimensions"
        :aria-label="t('styleComparison.findingsByDimension')"
      >
        <h3>{{ t("styleComparison.keyFindings") }}</h3>
        <article
          v-for="(dimension, index) in dimensions"
          :key="index"
          class="comparison-dimension"
        >
          <header>
            <h4>{{ dimension.name }}</h4>
            <span>{{ dimension.score }}<small> / 100</small></span>
          </header>
          <div class="comparison-meter" aria-hidden="true">
            <span :style="{ width: `${dimension.score}%` }" />
          </div>
          <p>{{ dimension.reason }}</p>
        </article>
      </section>
      <template v-if="result">
        <section class="comparison-findings">
          <h3>{{ t("styleComparison.keySimilarities") }}</h3>
          <ul>
            <li v-for="item in result.similarities" :key="item">{{ item }}</li>
          </ul>
        </section>
        <section class="comparison-findings">
          <h3>{{ t("styleComparison.mainDifferences") }}</h3>
          <ul>
            <li v-for="item in result.differences" :key="item">{{ item }}</li>
          </ul>
        </section>
        <footer class="comparison-result-footer">
          <small>{{
            isStale
              ? t("styleComparison.previousTextAssessment")
              : t("styleComparison.currentTextAssessment")
          }}</small
          ><button
            class="comparison-text-button"
            type="button"
            @click="copyResult"
          >
            <AppIcon name="copy" :size="14" />{{
              t("styleComparison.copyResult")
            }}
          </button>
        </footer>
      </template>
    </template>
  </div>
</template>

<style scoped src="./style-comparison-result.css"></style>
