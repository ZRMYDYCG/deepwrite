<script setup lang="ts">
import { builtinFontLabel } from "./catalogLabels";
import { createScopedTranslator } from "../i18n";
import { computed, ref } from "vue";
import {
  listAppearanceEditorFontFamilyOptions,
  listAppearanceUiFontFamilyOptions,
  type AppearanceCustomFont
} from "@deepwrite/contracts/renderer";
import { useAppearance } from "../composables/useAppearance";
import {
  appearanceFontFailureLabel,
  customFontOptionStyle,
  useAppearanceFonts
} from "../composables/useAppearanceFonts";
import { uiMessage } from "../ui-feedback";
import AppearanceFontDeleteDialog from "./AppearanceFontDeleteDialog.vue";
import PopupSelect, {
  type PopupSelectOption,
  type PopupSelectValue
} from "./PopupSelect.vue";

const t = createScopedTranslator("components.appearanceFontSettings");

const appearance = useAppearance();
const localFonts = useAppearanceFonts();
const pendingDelete = ref<AppearanceCustomFont | null>(null);
const UI_FONT_LOADING_VALUE = "appearance-ui-font-loading";
const EDITOR_FONT_LOADING_VALUE = "appearance-editor-font-loading";
const uiFontPending = ref(false);
const editorFontPending = ref(false);
let uiFontSelectionIntent = 0;
let editorFontSelectionIntent = 0;

const builtinUiOptions: PopupSelectOption[] =
  listAppearanceUiFontFamilyOptions().map((option) => ({
    value: option.value,
    get label() {
      return builtinFontLabel(option.value, option.label);
    },
    style: { fontFamily: option.stack }
  }));
const builtinEditorOptions: PopupSelectOption[] =
  listAppearanceEditorFontFamilyOptions().map((option) => ({
    value: option.value,
    get label() {
      return builtinFontLabel(option.value, option.label);
    },
    style: { fontFamily: option.stack }
  }));

const customOptions = computed<PopupSelectOption[]>(() =>
  localFonts.fonts.value.map((font) => ({
    value: font.id,
    label: font.displayName,
    description: t("localFontValue", {
      arg0: font.format.toUpperCase()
    }),
    style: customFontOptionStyle(font.id),
    actionIcon: "trash",
    actionLabel: t("deleteFontValue", {
      arg0: font.displayName
    })
  }))
);
const uiFontOptions = computed(() => [
  ...builtinUiOptions,
  ...customOptions.value
]);
const editorFontOptions = computed(() => [
  ...builtinEditorOptions,
  ...customOptions.value
]);
const uiFontModelValue = computed(() =>
  uiFontPending.value ? UI_FONT_LOADING_VALUE : appearance.state.uiFontFamily
);
const editorFontModelValue = computed(() =>
  editorFontPending.value
    ? EDITOR_FONT_LOADING_VALUE
    : appearance.state.editorFontFamily
);
const deleting = computed(
  () =>
    pendingDelete.value !== null &&
    localFonts.removingIds.includes(pendingDelete.value.id)
);

async function selectUiFontFamily(value: PopupSelectValue): Promise<void> {
  const intent = ++uiFontSelectionIntent;
  uiFontPending.value = true;
  try {
    await appearance.setUiFontFamily(String(value));
  } catch {
    if (intent === uiFontSelectionIntent) {
      uiMessage.error(t("couldNotLoadThisInterfaceFontYourPreviousSelection"));
    }
  } finally {
    if (intent === uiFontSelectionIntent) uiFontPending.value = false;
  }
}

async function selectEditorFontFamily(value: PopupSelectValue): Promise<void> {
  const intent = ++editorFontSelectionIntent;
  editorFontPending.value = true;
  try {
    await appearance.setEditorFontFamily(String(value));
  } catch {
    if (intent === editorFontSelectionIntent) {
      uiMessage.error(t("couldNotLoadThisManuscriptFontYourPreviousSelection"));
    }
  } finally {
    if (intent === editorFontSelectionIntent) editorFontPending.value = false;
  }
}

function requestDelete(value: PopupSelectValue): void {
  pendingDelete.value =
    localFonts.fonts.value.find((font) => font.id === String(value)) ?? null;
}

async function installFonts(): Promise<void> {
  try {
    const outcome = await localFonts.install();
    if (outcome.result.status === "canceled") return;

    if (outcome.loadedIds.length > 0) {
      uiMessage.success(
        t("importedValueLocalFonts", {
          arg0: outcome.loadedIds.length
        })
      );
    }
    if (outcome.result.duplicateIds.length > 0) {
      uiMessage.info(
        t("skippedValueDuplicateFonts", {
          arg0: outcome.result.duplicateIds.length
        })
      );
    }
    const failureCount =
      outcome.result.rejected.length + outcome.loadFailures.length;
    if (failureCount > 0) {
      const firstFailure = outcome.result.rejected[0];
      const detail = firstFailure
        ? appearanceFontFailureLabel(firstFailure)
        : t("valueFailedToLoad", {
            arg0: outcome.loadFailures[0]?.displayName ?? t("fonts")
          });
      uiMessage.warning(
        t("couldNotImportValueFontsValue", {
          arg0: failureCount,
          arg1: detail
        }),
        {
          duration: 5_000
        }
      );
    }
    if (
      outcome.loadedIds.length === 0 &&
      outcome.result.duplicateIds.length === 0 &&
      failureCount === 0
    ) {
      uiMessage.info(t("noFontFilesSelected"));
    }
  } catch {
    uiMessage.error(t("couldNotImportFontsTryAgainLater"));
  }
}

async function confirmDelete(): Promise<void> {
  const font = pendingDelete.value;
  if (!font || deleting.value) return;
  try {
    const result = await localFonts.remove(font.id);
    await appearance.applyDesktopSettings(result.appearance.settings);
    pendingDelete.value = null;
    if (result.removed)
      uiMessage.success(
        t("deletedFontValue", {
          arg0: font.displayName
        })
      );
    else uiMessage.info(t("thisFontNoLongerExists"));
  } catch {
    uiMessage.error(t("couldNotDeleteTheFontTryAgainLater"));
  }
}
</script>

<template>
  <section class="appearance-font-settings" aria-labelledby="font-heading">
    <h2 id="font-heading">
      {{ t("fonts") }}
    </h2>
    <div class="font-settings-card">
      <div class="font-setting-row">
        <span class="font-setting-copy">
          <strong>{{ t("interfaceFont") }}</strong>
          <small>{{ t("textInTheSidebarSettingsAndConversations") }}</small>
        </span>
        <PopupSelect
          class="font-select-control"
          :model-value="uiFontModelValue"
          :options="uiFontOptions"
          :accessible-label="t('selectInterfaceFont')"
          :placeholder="uiFontPending ? t('loadingFonts') : t('select')"
          align="end"
          :menu-min-width="240"
          :disabled="!localFonts.ready.value || localFonts.installing.value"
          @update:model-value="selectUiFontFamily"
          @option-action="requestDelete"
        />
      </div>
      <div class="font-setting-row">
        <span class="font-setting-copy">
          <strong>{{ t("manuscriptFont") }}</strong>
          <small>{{
            t("titlesManuscriptTextAndPreviewsForShortStoriesAnd")
          }}</small>
        </span>
        <PopupSelect
          class="font-select-control"
          :model-value="editorFontModelValue"
          :options="editorFontOptions"
          :accessible-label="t('selectManuscriptFont')"
          :placeholder="editorFontPending ? t('loadingFonts') : t('select')"
          align="end"
          :menu-min-width="240"
          :disabled="!localFonts.ready.value || localFonts.installing.value"
          @update:model-value="selectEditorFontFamily"
          @option-action="requestDelete"
        />
      </div>
      <div class="font-setting-row">
        <span class="font-setting-copy">
          <strong>{{ t("localFonts") }}</strong>
          <small>{{ t("uploadTTFOrOTFFilesToSaveFontsIn") }}</small>
        </span>
        <button
          class="font-upload-button"
          type="button"
          :disabled="!localFonts.ready.value || localFonts.installing.value"
          @click="installFonts"
        >
          {{ localFonts.installing.value ? t("importing") : t("uploadFont") }}
        </button>
      </div>
    </div>
  </section>

  <AppearanceFontDeleteDialog
    :font="pendingDelete"
    :busy="deleting"
    @close="pendingDelete = null"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.appearance-font-settings {
  margin-top: 40px;
}

.appearance-font-settings h2 {
  margin: 0 0 14px;
  color: var(--text-primary);
  font-size: 1.07143rem;
  font-weight: 640;
}

.font-settings-card {
  display: flex;
  flex-direction: column;
  padding: 6px 0;
  border: 1px solid var(--theme-line-soft);
  border-radius: 13px;
  background: var(--surface-raised);
}

.font-setting-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
}

.font-setting-row:not(:last-child) {
  border-bottom: 1px solid var(--theme-line-soft);
}

.font-setting-copy {
  display: flex;
  min-width: min(240px, 100%);
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.font-setting-copy strong {
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 590;
}

.font-setting-copy small {
  color: var(--text-secondary);
  font-size: 0.892857rem;
  line-height: 1.45;
}

.font-select-control {
  width: 240px;
  min-width: 170px;
  max-width: 240px;
  flex: 0 1 240px;
}

.font-upload-button {
  min-width: 112px;
  min-height: 36px;
  padding: 7px 14px;
  border: 1px solid color-mix(in srgb, var(--neutral-solid) 88%, transparent);
  border-radius: 9px;
  background: var(--neutral-solid);
  color: var(--accent-contrast, #fff);
  font: inherit;
  font-size: 0.892857rem;
  font-weight: 570;
  cursor: pointer;
}

.font-upload-button:hover:not(:disabled) {
  background: color-mix(
    in srgb,
    var(--neutral-solid) 88%,
    var(--theme-foreground)
  );
}

.font-upload-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

@media (max-width: 760px) {
  .font-setting-row {
    align-items: stretch;
    flex-direction: column;
  }

  .font-select-control {
    width: 100%;
    max-width: none;
    flex-basis: auto;
  }

  .font-upload-button {
    align-self: flex-end;
  }
}
</style>
