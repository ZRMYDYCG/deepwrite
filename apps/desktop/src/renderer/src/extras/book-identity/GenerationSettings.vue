<script setup lang="ts">
import { useId } from "vue";
import type {
  BookIdentityField,
  CoverAspectRatio,
  CoverTitleRendering
} from "@deepwrite/contracts/renderer";
import PresetManagerShell from "../analysis-ui/PresetManagerShell.vue";
import IdentityFieldTabs from "./IdentityFieldTabs.vue";
import PopupSelect from "../../components/PopupSelect.vue";
import type { IdentityProfile } from "./useIdentityProfiles";
import { fieldLabel, countLimits, identityT as t } from "./book-identity-utils";
defineProps<{
  profiles: readonly IdentityProfile[];
  disabled: boolean;
  busy: boolean;
  open: boolean;
  ratios: readonly CoverAspectRatio[];
}>();
const field = defineModel<BookIdentityField>("field", { required: true });
const panelId = useId();
defineEmits<{
  close: [];
  setDefault: [];
}>();
const profileId = defineModel<string>("profileId", { required: true });
const count = defineModel<number>("count", { required: true });
const brief = defineModel<string>("brief", { required: true });
const images = defineModel<number>("images", { required: true });
const ratio = defineModel<CoverAspectRatio>("ratio", { required: true });
const titleRendering = defineModel<CoverTitleRendering>("titleRendering", {
  required: true
});
const autoRender = defineModel<boolean>("autoRender", { required: true });
</script>
<template>
  <PresetManagerShell
    modal-class="identity-settings-dialog"
    :open="open"
    :title="t('generationSettings')"
    :description="fieldLabel(field)"
    :close-label="t('close')"
    @close="$emit('close')"
  >
    <IdentityFieldTabs
      v-model="field"
      :label="t('generationSettings')"
      :panel-id="panelId"
    />
    <div
      :id="panelId"
      class="identity-generation-settings"
      role="tabpanel"
      :aria-labelledby="`${panelId}-${field}-tab`"
    >
      <div class="identity-generation-grid">
        <label
          >{{ t("profile")
          }}<PopupSelect
            :menu-z-index="3200"
            v-model="profileId"
            :options="profiles.map((p) => ({ value: p.id, label: p.name }))"
            :accessible-label="t('profile')"
            :disabled="disabled || busy" /></label
        ><label
          >{{ t("count")
          }}<input
            v-model.number="count"
            type="number"
            min="1"
            :max="countLimits[field]"
            :disabled="disabled || busy"
        /></label>
      </div>
      <div v-if="field === 'cover'" class="identity-generation-grid">
        <label
          >{{ t("aspectRatio")
          }}<PopupSelect
            :menu-z-index="3200"
            v-model="ratio"
            :options="ratios.map((value) => ({ value, label: value }))"
            :accessible-label="t('aspectRatio')"
            :disabled="disabled || busy" /></label
        ><label
          >{{ t("imagesPerCandidate")
          }}<input
            v-model.number="images"
            type="number"
            min="1"
            max="4"
            :disabled="disabled || busy" /></label
        ><label
          >{{ t("titleRendering")
          }}<PopupSelect
            :menu-z-index="3200"
            v-model="titleRendering"
            :options="[
              { value: 'model', label: t('modelText') },
              { value: 'overlay', label: t('overlay') }
            ]"
            :accessible-label="t('titleRendering')"
            :disabled="disabled || busy" /></label
        ><label class="identity-check"
          ><input
            v-model="autoRender"
            type="checkbox"
            :disabled="disabled || busy"
          />{{ t("autoRender") }}</label
        >
      </div>
      <label class="identity-settings-brief">
        <span>{{ t("brief") }}</span>
        <textarea
          v-model="brief"
          rows="3"
          maxlength="2000"
          :placeholder="t('briefPlaceholder')"
          :disabled="disabled || busy"
        />
      </label>
    </div>
    <template #footer>
      <button :disabled="disabled || busy" @click="$emit('setDefault')">
        {{ t("setDefault") }}
      </button>
      <button class="analysis-primary-button" @click="$emit('close')">
        {{ t("done") }}
      </button>
    </template>
  </PresetManagerShell>
</template>
<style src="./generation-settings.css"></style>
