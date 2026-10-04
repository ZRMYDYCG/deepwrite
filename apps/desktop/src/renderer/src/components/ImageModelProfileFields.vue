<script setup lang="ts">
import { computed, watch } from "vue";
import {
  IMAGE_MODEL_PRESETS,
  imageModelCapability,
  type ImagePresetId
} from "@deepwrite/contracts/renderer";
import PopupSelect from "./PopupSelect.vue";
import { createScopedTranslator } from "../i18n";
import type { ImageModelSettingsController } from "../composables/useImageModelSettings";
const t = createScopedTranslator("components.imageModelSettings");
const props = defineProps<{ configuration: ImageModelSettingsController }>();
const draft = props.configuration.draft;
const preset = computed(() =>
  draft.value ? IMAGE_MODEL_PRESETS[draft.value.presetId] : null
);
const presetOptions = Object.values(IMAGE_MODEL_PRESETS).map((p) => ({
  value: p.id,
  label: p.label
}));
const savedKey = computed(
  () =>
    props.configuration.settings.value.profiles.find(
      (p) => p.id === draft.value?.id
    )?.hasApiKey
);
const ratios = computed(() =>
  (draft.value
    ? imageModelCapability(draft.value.presetId, draft.value.model).aspectRatios
    : []
  ).map((value) => ({
    value,
    label: value
  }))
);
watch(ratios, (options) => {
  if (
    draft.value &&
    !options.some(({ value }) => value === draft.value!.defaultAspectRatio)
  )
    draft.value.defaultAspectRatio = options[0]?.value ?? "3:4";
});
</script>
<template>
  <div v-if="draft" class="image-profile-grid">
    <label
      ><span>{{ t("preset") }}</span
      ><PopupSelect
        :model-value="draft.presetId"
        :options="presetOptions"
        :accessible-label="t('preset')"
        @update:model-value="
          configuration.applyPreset(String($event) as ImagePresetId)
        "
    /></label>
    <label
      ><span>{{ t("name") }}</span
      ><input v-model="draft.name" maxlength="40"
    /></label>
    <label class="image-span"
      ><span>{{ t("endpoint") }}</span
      ><input v-model="draft.baseUrl" type="url"
    /></label>
    <label
      ><span>{{ t("model") }}</span
      ><input v-model="draft.model" maxlength="160"
    /></label>
    <label
      ><span>{{ t("aspectRatio") }}</span
      ><PopupSelect
        v-model="draft.defaultAspectRatio"
        :options="ratios"
        :accessible-label="t('aspectRatio')"
    /></label>
    <label class="image-span"
      ><span>{{ t("key") }}</span
      ><input
        v-model="draft.apiKey"
        type="password"
        autocomplete="off"
        :placeholder="savedKey ? t('savedKey') : ''"
    /></label>
    <label v-if="draft.id" class="image-check"
      ><input v-model="draft.clearApiKey" type="checkbox" />{{
        t("clearKey")
      }}</label
    >
    <label v-if="preset?.supportsQuality"
      ><span>{{ t("quality") }}</span
      ><PopupSelect
        :model-value="draft.quality ?? 'standard'"
        @update:model-value="
          draft && (draft.quality = $event === 'high' ? 'high' : 'standard')
        "
        :options="[
          { value: 'standard', label: t('standard') },
          { value: 'high', label: t('high') }
        ]"
        :accessible-label="t('quality')"
    /></label>
    <label v-if="preset?.supportsWatermark" class="image-check"
      ><input v-model="draft.watermark" type="checkbox" />{{
        t("watermark")
      }}</label
    >
  </div>
</template>
<style scoped src="./image-model-settings.css"></style>
