<script setup lang="ts">
import { presetLabel } from "../analysis-ui/preset-labels";
import { computed } from "vue";
import { createScopedTranslator } from "../../i18n";
import type {
  LongBookAnalysisPreset,
  MaterialKind,
  MaterialStageId,
  SkillKind
} from "@deepwrite/contracts/renderer";
import PopupSelect, {
  type PopupSelectOption
} from "../../components/PopupSelect.vue";
import {
  MATERIAL_KIND_LABELS,
  MATERIAL_STAGE_KINDS,
  SKILL_KIND_LABELS
} from "../../data/catalogWorkspace";

const t = createScopedTranslator("extras");

const props = defineProps<{
  short?: boolean;
  preset: LongBookAnalysisPreset & { selectionMode?: "single" | "multiple" };
}>();

const materialKinds = computed<PopupSelectOption[]>(() =>
  (["character", "gimmick", "plot", "draft", "other"] as const).map(
    (value) => ({ value, label: MATERIAL_KIND_LABELS[value] })
  )
);
const skillKinds = computed<PopupSelectOption[]>(() =>
  (["general", "plot", "style", "other"] as const).map((value) => ({
    value,
    label: SKILL_KIND_LABELS[value]
  }))
);
const displayName = computed({
  get: () => presetLabel(props.preset),
  set: (value: string) => {
    props.preset.name = value;
  }
});
const displayDescription = computed({
  get: () => presetLabel(props.preset, "description"),
  set: (value: string) => {
    props.preset.description = value;
  }
});
const materialStageIds: readonly MaterialStageId[] = [
  "gimmick",
  "character",
  "pacing",
  "intro",
  "plot_refine",
  "draft_excerpt",
  "other"
] as const;
const domainOptions: PopupSelectOption[] = [
  {
    value: "material",
    get label() {
      return t("cloudBackup.materialLibrary");
    }
  },
  {
    value: "skill",
    get label() {
      return t("cloudBackup.skillLibrary");
    }
  }
];

const selectionOptions = [
  {
    value: "single",
    get label() {
      return t("longBookAnalysis.singleBook");
    }
  },
  {
    value: "multiple",
    get label() {
      return t("longBookAnalysis.multipleBooks");
    }
  }
];

function setDomain(
  preset: LongBookAnalysisPreset,
  value: string | number
): void {
  preset.output =
    value === "skill"
      ? { domain: "skill", kind: "general", stageId: "draft" }
      : { domain: "material", kind: "other", stageId: "other" };
}

function setKind(preset: LongBookAnalysisPreset, value: string | number): void {
  if (preset.output.domain === "material") {
    const kind = value as MaterialKind;
    const stageId =
      MATERIAL_STAGE_KINDS[preset.output.stageId] === kind
        ? preset.output.stageId
        : materialStageIds.find(
            (stageId) => MATERIAL_STAGE_KINDS[stageId] === kind
          );
    preset.output = {
      domain: "material",
      kind,
      stageId: stageId ?? "other"
    };
    return;
  }
  preset.output = {
    domain: "skill",
    kind: value as SkillKind,
    stageId: preset.output.stageId
  };
}
</script>

<template>
  <div class="preset-editor">
    <label class="preset-output-field">
      <span>{{ t("longBookAnalysis.presetName") }}</span>
      <input
        v-model="displayName"
        maxlength="80"
        :aria-label="t('longBookAnalysis.presetName')"
      />
    </label>
    <label class="preset-output-field">
      <span>{{ t("longBookAnalysis.presetDescription") }}</span>
      <input
        v-model="displayDescription"
        maxlength="500"
        :aria-label="t('longBookAnalysis.presetDescription')"
      />
    </label>
    <label v-if="short" class="preset-output-field"
      ><span>{{ t("longBookAnalysis.bookSelectionCount") }}</span
      ><PopupSelect
        :model-value="preset.selectionMode ?? 'single'"
        @update:model-value="
          preset.selectionMode = $event === 'multiple' ? 'multiple' : 'single'
        "
        :options="selectionOptions"
        :accessible-label="t('longBookAnalysis.bookSelectionCount')"
        :menu-z-index="3200"
    /></label>
    <div class="preset-output-row">
      <label class="preset-output-field">
        <span>{{ t("longBookAnalysis.outputDomain") }}</span>
        <PopupSelect
          :model-value="preset.output.domain"
          :options="domainOptions"
          :accessible-label="t('longBookAnalysis.resultDomain')"
          :menu-z-index="3200"
          @update:model-value="setDomain(preset, $event)"
        />
      </label>
      <label class="preset-output-field">
        <span>{{ t("longBookAnalysis.libraryCategory") }}</span>
        <PopupSelect
          :model-value="preset.output.kind"
          :options="
            preset.output.domain === 'material' ? materialKinds : skillKinds
          "
          :accessible-label="t('longBookAnalysis.libraryCategory')"
          :menu-z-index="3200"
          @update:model-value="setKind(preset, $event)"
        />
      </label>
    </div>
    <label class="preset-output-field">
      <span>{{ t("longBookAnalysis.systemPrompt") }}</span>
      <textarea
        v-model="preset.systemPrompt"
        maxlength="200000"
        :aria-label="t('longBookAnalysis.presetSystemPrompt')"
      />
    </label>
  </div>
</template>

<style scoped>
.preset-editor {
  display: grid;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--theme-line-soft);
}
.preset-editor input,
.preset-editor textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--surface-muted);
  color: var(--text-primary);
  font: inherit;
}
.preset-editor input:focus-visible,
.preset-editor textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.preset-editor textarea {
  min-height: 200px;
  resize: vertical;
  line-height: 1.6;
}
.preset-output-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.preset-output-field {
  display: grid;
  min-width: 0;
  gap: 6px;
}
.preset-output-field > span {
  color: var(--text-secondary);
  font-size: 0.85rem;
}
@media (max-width: 720px) {
  .preset-output-row {
    grid-template-columns: 1fr;
  }
}
</style>
