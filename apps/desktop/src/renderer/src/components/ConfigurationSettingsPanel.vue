<script setup lang="ts">
import { createScopedTranslator, locale } from "../i18n";
import { computed } from "vue";
import type {
  ContextCompactionSettings,
  ModelSettings
} from "@deepwrite/contracts";
import { maxTextAttachmentCharactersForBudget } from "@deepwrite/contracts/renderer";
import ContextCompactionSettingsCard from "./ContextCompactionSettingsCard.vue";
import PopupSelect from "./PopupSelect.vue";

const t = createScopedTranslator("components.configurationSettingsPanel");

const props = defineProps<{
  showContextUsage: boolean;
  textAttachmentMaxCharacters: number;
  contextCompaction: ContextCompactionSettings;
  modelSettings: ModelSettings | null;
}>();

const textLimitOptions = computed(() => {
  const maximum = maxTextAttachmentCharactersForBudget(
    props.contextCompaction.budgetTokens
  );
  return [
    ...new Set([
      10_000,
      25_000,
      50_000,
      100_000,
      150_000,
      200_000,
      maximum,
      props.textAttachmentMaxCharacters
    ])
  ]
    .filter((value) => value <= maximum)
    .sort((left, right) => left - right)
    .map((value) => ({
      value,
      label: t("characterCount", { value: value.toLocaleString(locale.value) })
    }));
});

const emit = defineEmits<{
  updateShowContextUsage: [enabled: boolean];
  updateTextAttachmentMaxCharacters: [value: number];
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
      <div class="settings-item attachment-limit-setting">
        <span class="settings-item-text"
          ><strong>{{ t("textAttachmentCharacterLimit") }}</strong
          ><small>{{
            t("textAttachmentCharacterLimitDescription")
          }}</small></span
        >
        <PopupSelect
          class="attachment-limit-select"
          :model-value="textAttachmentMaxCharacters"
          :options="textLimitOptions"
          :accessible-label="t('textAttachmentCharacterLimit')"
          align="end"
          :menu-min-width="190"
          @update:model-value="
            emit('updateTextAttachmentMaxCharacters', Number($event))
          "
        />
      </div>
    </div>

    <ContextCompactionSettingsCard
      :settings="contextCompaction"
      :model-settings="modelSettings"
      @update="emit('updateContextCompaction', $event)"
    />
  </section>
</template>

<style scoped src="./settings-page.css"></style>
<style scoped>
.attachment-limit-setting {
  flex-wrap: wrap;
}

.attachment-limit-select {
  width: 180px;
  max-width: 100%;
  flex: 0 1 180px;
}
</style>
