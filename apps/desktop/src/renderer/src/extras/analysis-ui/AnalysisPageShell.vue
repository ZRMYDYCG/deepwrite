<script setup lang="ts">
import { t } from "../../i18n";
import "./analysis-ui.css";

defineProps<{ title: string; description: string }>();
</script>

<template>
  <section class="analysis-workbench" :aria-label="title">
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
