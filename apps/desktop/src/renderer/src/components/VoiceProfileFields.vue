<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import PopupSelect from "./PopupSelect.vue";
import type { useVoiceSettings } from "../composables/useVoiceSettings";
import {
  VOICE_ACCESS_OPTIONS,
  VOICE_PROVIDER_OPTIONS,
  VOICE_PROFILE_LABELS
} from "../composables/voiceSettingsOptions";
import { computed } from "vue";

const t = createScopedTranslator("components.voiceProfileFields");
const props = defineProps<{
  configuration: ReturnType<typeof useVoiceSettings>;
  disabled: boolean;
}>();
const {
  settings,
  provider,
  accessMode,
  apiKey,
  currentProfile,
  keyConfigured,
  removeCurrentKey,
  resetCurrentEndpoint
} = props.configuration;
const profileLabel = computed(
  () => VOICE_PROFILE_LABELS[settings.value.activeProfileId]
);
</script>
<template>
  <div class="voice-model-fields">
    <div class="settings-item settings-select-item">
      <span class="settings-item-text"
        ><strong>{{ t("provider") }}</strong
        ><small>{{ t("selectSpeechRecognitionService") }}</small></span
      >
      <PopupSelect
        class="general-select-control"
        :model-value="provider"
        :options="VOICE_PROVIDER_OPTIONS"
        :accessible-label="t('voiceProvider')"
        align="end"
        :disabled="disabled"
        @update:model-value="provider = String($event)"
      />
    </div>
    <div class="settings-item settings-select-item">
      <span class="settings-item-text"
        ><strong>{{ t("accessMode") }}</strong
        ><small>{{
          t("tokenPlanAndOpenPlatformSettingsAreSavedSeparately")
        }}</small></span
      >
      <PopupSelect
        class="general-select-control"
        :model-value="accessMode"
        :options="VOICE_ACCESS_OPTIONS"
        :accessible-label="t('voiceAccessMode')"
        align="end"
        :disabled="disabled"
        @update:model-value="accessMode = String($event)"
      />
    </div>
    <label class="settings-item settings-select-item">
      <span class="settings-item-text"
        ><strong>API Key</strong
        ><small
          >{{ profileLabel }} ·
          {{
            keyConfigured
              ? t("keySavedLeaveBlankToKeep")
              : t("keyNotConfigured")
          }}</small
        ></span
      >
      <input
        v-model="apiKey"
        class="voice-input"
        type="password"
        autocomplete="new-password"
        :placeholder="
          keyConfigured ? t('leaveBlankToKeepExistingKey') : t('enterAPIKey')
        "
      />
    </label>
    <div v-if="keyConfigured" class="settings-item">
      <span class="settings-item-text"
        ><strong>{{ t("savedKey") }}</strong
        ><small>{{
          t("savedKeysAreNotDisplayedSaveSettingsAfterRemoving")
        }}</small></span
      >
      <button class="voice-button" type="button" @click="removeCurrentKey">
        {{ t("removeKey") }}
      </button>
    </div>
    <label class="settings-item settings-select-item">
      <span class="settings-item-text"
        ><strong>{{ t("endpoint") }}</strong
        ><small>{{ t("hTTPSEndpointForTheVoiceService") }}</small></span
      >
      <input
        v-model="currentProfile.baseUrl"
        class="voice-input"
        type="url"
        inputmode="url"
        spellcheck="false"
        autocomplete="off"
      />
    </label>
    <label class="settings-item settings-select-item">
      <span class="settings-item-text"
        ><strong>{{ t("speechRecognitionModel") }}</strong
        ><small>{{
          t("availableModelsAndQuotaDependOnTheProvider")
        }}</small></span
      >
      <input
        v-model="currentProfile.model"
        class="voice-input"
        type="text"
        spellcheck="false"
        autocomplete="off"
      />
    </label>
    <div class="settings-item">
      <span class="settings-item-text"
        ><strong>{{ t("defaultSettings") }}</strong
        ><small>{{
          t("restoreTheDefaultEndpointAndModelForThisAccess")
        }}</small></span
      >
      <button class="voice-button" type="button" @click="resetCurrentEndpoint">
        {{ t("restoreDefaults") }}
      </button>
    </div>
  </div>
</template>
<style scoped src="./settings-page.css"></style>
<style scoped src="./voice-settings.css"></style>
