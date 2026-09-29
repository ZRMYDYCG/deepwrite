<script setup lang="ts">
import { presetLabel } from "../analysis-ui/preset-labels";
import { createScopedTranslator } from "../../i18n";
import { computed, ref, watch } from "vue";
import type {
  CatalogSnapshot,
  LongBookAnalysisPreset,
  LongBookAnalysisResult
} from "@deepwrite/contracts/renderer";
import MarkdownContent from "../../components/MarkdownContent.vue";
import PopupSelect, {
  type PopupSelectOption
} from "../../components/PopupSelect.vue";
import {
  analysisLibraryOption,
  analysisOutputTypeLabel,
  compatibleAnalysisLibraries
} from "./task-options";

const t = createScopedTranslator("extras");

const props = defineProps<{
  result: LongBookAnalysisResult;
  preset: LongBookAnalysisPreset;
  catalogSnapshot: CatalogSnapshot | null;
  saving: boolean;
  previous?: boolean;
  context?: string;
}>();
const emit = defineEmits<{
  update: [result: LongBookAnalysisResult];
  save: [
    input: {
      libraryId: string;
      baseProjectRevision?: number;
    }
  ];
}>();

const targetId = ref("");
const editing = ref(false);
const compatibleLibraries = computed(() =>
  compatibleAnalysisLibraries(props.preset, props.catalogSnapshot)
);
const targetOptions = computed<PopupSelectOption[]>(() =>
  compatibleLibraries.value.map(analysisLibraryOption)
);
const targetLibrary = computed(() => {
  return compatibleLibraries.value.find(
    (library) => library.id === targetId.value
  );
});
const outputTypeLabel = computed(() => analysisOutputTypeLabel(props.preset));

watch(
  [() => props.preset, compatibleLibraries],
  ([preset, libraries], previous) => {
    // A newly completed result always requires an explicit destination choice.
    if (
      preset !== previous[0] ||
      !libraries.some((library) => library.id === targetId.value)
    )
      targetId.value = "";
  },
  { immediate: true }
);

function updateName(event: Event): void {
  const element = event.target;
  if (element instanceof HTMLInputElement)
    emit("update", { ...props.result, name: element.value });
}

function updateDescription(event: Event): void {
  const element = event.target;
  if (element instanceof HTMLTextAreaElement)
    emit("update", { ...props.result, description: element.value });
}

function updateContent(event: Event): void {
  const element = event.target;
  if (element instanceof HTMLTextAreaElement)
    emit("update", { ...props.result, content: element.value });
}

function save(): void {
  if (!targetLibrary.value) return;
  emit("save", {
    libraryId: targetLibrary.value.id,
    ...(targetLibrary.value.projectRevision === undefined
      ? {}
      : { baseProjectRevision: targetLibrary.value.projectRevision })
  });
}
</script>

<template>
  <section class="analysis-card result-card">
    <header class="analysis-card-heading">
      <div>
        <p class="analysis-eyebrow">
          {{
            previous
              ? t("longBookAnalysis.previousCompletedResult")
              : t("longBookAnalysis.analysisResult")
          }}
        </p>
        <h2>{{ result.name }}</h2>
        <p class="analysis-result-origin">
          {{ context }} · {{ presetLabel(preset) }}
        </p>
      </div>
      <button type="button" :aria-pressed="editing" @click="editing = !editing">
        {{
          editing
            ? t("longBookAnalysis.finishEditing")
            : t("longBookAnalysis.editResult")
        }}
      </button>
    </header>
    <div v-if="editing" class="analysis-result-editor">
      <input
        class="result-title"
        :value="result.name"
        maxlength="256"
        :aria-label="t('longBookAnalysis.resultName')"
        @input="updateName"
      />
      <textarea
        class="result-description"
        :value="result.description"
        maxlength="1000"
        rows="3"
        :aria-label="t('longBookAnalysis.resultDescription')"
        :placeholder="t('longBookAnalysis.resultDescriptionPlaceholder')"
        @input="updateDescription"
      />
      <textarea
        class="result-body"
        :value="result.content"
        maxlength="200000"
        :aria-label="t('longBookAnalysis.resultMarkdown')"
        @input="updateContent"
      />
    </div>
    <div v-else class="analysis-result-reading">
      <p v-if="result.description" class="analysis-result-description">
        {{ result.description }}
      </p>
      <MarkdownContent :content="result.content" />
    </div>
    <div class="result-save-row">
      <div class="result-target-library">
        <label>
          <span>{{
            t("longBookAnalysis.saveToLibrary", {
              library:
                preset.output.domain === "material"
                  ? t("cloudBackup.materialLibrary")
                  : t("cloudBackup.skillLibrary")
            })
          }}</span>
          <PopupSelect
            v-model="targetId"
            :options="targetOptions"
            :accessible-label="t('longBookAnalysis.resultTargetLibrary')"
            :placeholder="
              targetOptions.length
                ? t('longBookAnalysis.chooseLibrary')
                : t('longBookAnalysis.noCompatibleLibrary')
            "
            :disabled="saving || targetOptions.length === 0"
            :menu-min-width="280"
          />
        </label>
        <small>{{
          t("longBookAnalysis.targetCanChange", {
            type: outputTypeLabel
          })
        }}</small>
      </div>
      <button
        class="analysis-primary-button"
        type="button"
        :disabled="saving || !targetLibrary"
        @click="save"
      >
        {{
          saving
            ? t("longBookAnalysis.writing")
            : t("longBookAnalysis.writeLibrary", {
                library:
                  preset.output.domain === "material"
                    ? t("cloudBackup.materialLibrary")
                    : t("cloudBackup.skillLibrary")
              })
        }}
      </button>
    </div>
    <p class="analysis-help">
      {{
        t("longBookAnalysis.saveCreatesEntry", {
          description: previous
            ? t("longBookAnalysis.previousResultDescription")
            : t("longBookAnalysis.editBeforeSaving")
        })
      }}
    </p>
  </section>
</template>

<style scoped>
.result-card {
  display: grid;
  gap: 12px;
}
.analysis-result-editor {
  display: grid;
  gap: 12px;
}
.analysis-result-origin,
.analysis-result-description {
  color: var(--text-secondary);
  line-height: 1.7;
}
.analysis-result-origin {
  margin: 6px 0 0;
  font-size: 0.785714rem;
}
.analysis-result-reading {
  min-width: 0;
  overflow-wrap: anywhere;
}
.result-title,
.result-description,
.result-body,
.result-target-library {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--surface-main);
  color: var(--text-primary);
  font: inherit;
}
.result-title {
  font-size: 16px;
  font-weight: 650;
}
.result-description {
  resize: vertical;
  line-height: 1.7;
}
.result-body {
  min-height: 420px;
  resize: vertical;
  line-height: 1.7;
}
.result-save-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.result-save-row > .analysis-primary-button {
  flex: 0 0 auto;
  min-width: 110px;
  white-space: nowrap;
}
.result-target-library {
  display: grid;
  min-width: 0;
  gap: 6px;
}
.result-target-library label {
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr);
  align-items: center;
  gap: 8px;
}
.result-target-library label > span,
.result-target-library small {
  color: var(--text-tertiary);
  font-size: 12px;
}
.analysis-help {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
@media (max-width: 800px) {
  .result-save-row {
    align-items: stretch;
    flex-direction: column;
  }
  .result-target-library label {
    grid-template-columns: 1fr;
  }
}
</style>
