<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import type {
  ContextCompactionSettings,
  ModelSettings
} from "@deepwrite/contracts";
import ContextCompactionSettingsCard from "./ContextCompactionSettingsCard.vue";

const t = createScopedTranslator("components.configurationSettingsPanel");

defineProps<{
  showContextUsage: boolean;
  contextCompaction: ContextCompactionSettings;
  modelSettings: ModelSettings | null;
}>();

const emit = defineEmits<{
  updateShowContextUsage: [enabled: boolean];
  updateContextCompaction: [settings: ContextCompactionSettings];
}>();
</script>

<template>
  <section class="settings-group">
    <h2 class="settings-group-title">
      {{ t("contextSettings") }}
    </h2>
    <div class="settings-card">
      <label class="settings-item">
        <span class="settings-item-text"
          ><strong>{{ t("showContextUsage") }}</strong
          ><small>{{ t("showTheCurrentModelSContextUsageInThe") }}</small></span
        >
        <span class="settings-toggle"
          ><input
            type="checkbox"
            :checked="showContextUsage"
            :aria-label="t('showContextUsage')"
            @change="
              emit(
                'updateShowContextUsage',
                ($event.target as HTMLInputElement).checked
              )
            "
        /></span>
      </label>
    </div>

    <ContextCompactionSettingsCard
      :settings="contextCompaction"
      :model-settings="modelSettings"
      @update="emit('updateContextCompaction', $event)"
    />
  </section>
</template>

<style scoped src="./settings-page.css"></style>
