<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import type {
  BodyTextFormat,
  BodyTextFormats,
  BodyTextFormatChange,
  BodyTextKind,
  TextViewMode
} from "@deepwrite/contracts";
import PopupSelect from "./PopupSelect.vue";

const t = createScopedTranslator("components.bodyTextSettingsPanel");

defineProps<{
  defaultTextViewMode: TextViewMode;
  bodyTextFormats: BodyTextFormats;
}>();
const emit = defineEmits<{
  updateDefaultTextViewMode: [mode: TextViewMode];
  updateBodyTextFormat: [change: BodyTextFormatChange];
}>();
const textViewModeOptions = [
  {
    value: "edit",
    get label() {
      return t("edit");
    }
  },
  {
    value: "preview",
    get label() {
      return t("preview");
    }
  }
];
const formatOptions: { value: BodyTextFormat; label: string }[] = [
  {
    value: "flush-compact",
    get label() {
      return t("noIndentOrBlankLinesBetweenParagraphs");
    }
  },
  {
    value: "flush-spaced",
    get label() {
      return t("noIndentOneBlankLineBetweenParagraphs");
    }
  },
  {
    value: "indent-compact",
    get label() {
      return t("twoCharacterIndentNoBlankLinesBetweenParagraphs");
    }
  },
  {
    value: "indent-spaced",
    get label() {
      return t("twoCharacterIndentOneBlankLineBetweenParagraphs");
    }
  }
];
const fields: { kind: BodyTextKind; label: string }[] = [
  {
    kind: "short",
    get label() {
      return t("shortStoryManuscriptFormatting");
    }
  },
  {
    kind: "script",
    get label() {
      return t("screenplayManuscriptFormatting");
    }
  },
  {
    kind: "long",
    get label() {
      return t("novelManuscriptFormatting");
    }
  }
];
</script>

<template>
  <section class="settings-group">
    <h2 class="settings-group-title">
      {{ t("defaultDisplay") }}
    </h2>
    <div class="settings-card">
      <div class="settings-item body-text-setting">
        <span class="settings-item-text"
          ><strong>{{ t("defaultTextMode") }}</strong
          ><small>{{
            t("theInitialViewWhenOpeningTheAppOrSwitching")
          }}</small></span
        >
        <PopupSelect
          class="body-text-select"
          :model-value="defaultTextViewMode"
          :options="textViewModeOptions"
          :accessible-label="t('selectDefaultTextMode')"
          align="end"
          :menu-min-width="240"
          @update:model-value="
            emit('updateDefaultTextViewMode', String($event) as TextViewMode)
          "
        />
      </div>
    </div>
  </section>

  <section class="settings-group body-text-format-group">
    <h2 class="settings-group-title">
      {{ t("formatManuscript") }}
    </h2>
    <p class="body-text-format-description">
      {{ t("appliedWhenYouChooseFormatManuscriptInTheToolbar") }}
    </p>
    <div class="settings-card">
      <div
        v-for="field in fields"
        :key="field.kind"
        class="settings-item body-text-setting"
      >
        <span class="settings-item-text"
          ><strong>{{ field.label }}</strong></span
        >
        <PopupSelect
          class="body-text-select"
          :model-value="bodyTextFormats[field.kind]"
          :options="formatOptions"
          :accessible-label="
            t('selectValue', {
              arg0: field.label
            })
          "
          align="end"
          :menu-min-width="240"
          @update:model-value="
            emit('updateBodyTextFormat', {
              kind: field.kind,
              format: String($event) as BodyTextFormat
            })
          "
        />
      </div>
    </div>
  </section>
</template>

<style scoped src="./settings-page.css"></style>
<style scoped>
.body-text-setting {
  flex-wrap: wrap;
  gap: 16px;
}
.body-text-setting .settings-item-text {
  min-width: min(240px, 100%);
}
.body-text-select {
  width: 260px;
  max-width: 100%;
  flex: 0 1 260px;
}
.body-text-format-group {
  margin-top: 8px;
}
.body-text-format-description {
  margin: -6px 0 14px;
  color: var(--text-secondary);
  font-size: 0.892857rem;
  line-height: 1.45;
}
</style>
