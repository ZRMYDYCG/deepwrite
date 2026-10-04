<script setup lang="ts">
import { t } from "../../i18n";
import { ref } from "vue";
import "./analysis-ui.css";

defineProps<{ title: string; description: string }>();
const viewport = ref<HTMLElement | null>(null);
function scrollToResult(element: HTMLElement | null): void {
  const container = viewport.value;
  if (!container || !element || !container.contains(element)) return;
  const margin =
    Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
  // scrollIntoView also scrolls clipped workspace ancestors. Keep the result
  // reveal inside this viewport and finish it before the user starts scrolling.
  container.scrollTo({
    top:
      container.scrollTop +
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      container.clientTop -
      margin,
    behavior: "instant"
  });
}
defineExpose({ scrollToResult });
</script>

<template>
  <section ref="viewport" class="analysis-workbench" :aria-label="title">
    <header class="analysis-page-header">
      <div class="analysis-page-intro">
        <p class="analysis-eyebrow">
          {{ t("extras.analysisUi.moreFeatures") }}
        </p>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <slot name="header-actions" />
    </header>
    <div class="analysis-content"><slot /></div>
  </section>
</template>
