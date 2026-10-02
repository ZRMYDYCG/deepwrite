<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  BUILT_IN_REASONING_LEVELS,
  LONG_AGENT_IDS,
  LongAgentTeamSettingsInputSchema,
  getDefaultLongAgentProfile,
  SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH,
  LONG_AGENT_SUBAGENT_MAX_COUNT,
  SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH,
  type BuiltInReasoningLevel,
  type LongAgentId,
  type LongAgentTeamSettings,
  type LongAgentTeamSettingsInput,
  type ModelConfig,
  type ShortAgentSubagentDefinition,
  type ShortAgentSubagentModelMode,
  type SkillLibrary,
  type SubagentAuthoringDraft,
  type SubagentAuthoringRuntimeContext,
  type ThinkingLevel
} from "@deepwrite/contracts/renderer";
import { computed, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";
import AgentTeamParallelSwitch from "./AgentTeamParallelSwitch.vue";
import LoadSubagentFromSkillDialog from "./LoadSubagentFromSkillDialog.vue";
import PopupSelect, { type PopupSelectOption } from "./PopupSelect.vue";
import { createCopiedSubagent } from "./agentTeamSettingsEditorHelpers";

const t = createScopedTranslator("components.longAgentTeamSettingsPanel");

const props = defineProps<{
  settings: LongAgentTeamSettings | null;
  models: readonly ModelConfig[];
  skills: readonly SkillLibrary[];
  preferredModelId: string | null;
  loading: boolean;
  saving: boolean;
  loadError?: string | null;
  runtimeAvailable: boolean;
  authoringGenerating: boolean;
  authoringDraft: SubagentAuthoringDraft | null;
  authoringStatusText: string | null;
  authoringError: string | null;
}>();

const emit = defineEmits<{
  retry: [];
  save: [settings: LongAgentTeamSettingsInput];
  authoringGenerate: [
    payload: {
      context: SubagentAuthoringRuntimeContext;
      modelId: string;
    }
  ];
  authoringStop: [];
  authoringReset: [];
}>();

const PARENT_AGENT_DESCRIPTION = computed(() =>
  t("configureSpecialistAssistantsForWorldbuildingCharactersPlotManuscriptAnd")
);

const parentAgentId: LongAgentId = LONG_AGENT_IDS[0];
const draftTeams = ref<LongAgentTeamSettingsInput["teams"]>([]);
const draftParallelSubagents = ref(false);
const editingSubagentId = ref<string | null>(null);
const loadFromSkillOpen = ref(false);
let generatedIdSequence = 0;

const formDisabled = computed(
  () => props.loading || props.saving || !props.runtimeAvailable
);
const parentAgentLabel = computed(
  () => getDefaultLongAgentProfile(parentAgentId).label
);
const activeTeam = computed(() =>
  draftTeams.value.find((team) => team.parentAgentId === parentAgentId)
);
const modelById = computed(
  () => new Map(props.models.map((model) => [model.id, model]))
);
const modelOptions = computed<PopupSelectOption[]>(() =>
  props.models.map((model) => ({ value: model.id, label: model.label }))
);

const THINKING_LABELS: Record<BuiltInReasoningLevel, string> = {
  get minimal() {
    return t("minimal");
  },
  get low() {
    return t("low");
  },
  get medium() {
    return t("medium");
  },
  get high() {
    return t("high");
  },
  get xhigh() {
    return t("extraHigh");
  },
  get max() {
    return t("maximum");
  }
};

watch(
  () => props.settings,
  (settings) => {
    draftParallelSubagents.value = settings?.parallelSubagents ?? false;
    draftTeams.value = settings
      ? settings.teams.map((team) => ({
          parentAgentId: team.parentAgentId,
          subagents: team.subagents.map((definition) => ({
            ...definition,
            modelMode: definition.modelMode ?? "inherit",
            ...(definition.modelId ? { modelId: definition.modelId } : {}),
            ...(definition.thinkingLevel !== undefined
              ? { thinkingLevel: definition.thinkingLevel }
              : {}),
            ...(definition.temperature !== undefined
              ? { temperature: definition.temperature }
              : {})
          }))
        }))
      : [];
    editingSubagentId.value = null;
  },
  { immediate: true, deep: true }
);

function thinkingLabel(level: ThinkingLevel): string {
  if (level === "off") return t("off");
  return BUILT_IN_REASONING_LEVELS.includes(level as BuiltInReasoningLevel)
    ? THINKING_LABELS[level as BuiltInReasoningLevel]
    : t("customValue", { arg0: level });
}

function thinkingOptionsFor(
  definition: ShortAgentSubagentDefinition
): PopupSelectOption[] {
  const model = definition.modelId
    ? modelById.value.get(definition.modelId)
    : undefined;
  return [
    { value: "off", label: thinkingLabel("off") },
    ...(model?.thinkingLevelOptions ?? BUILT_IN_REASONING_LEVELS).map(
      (level) => ({
        value: level,
        label: thinkingLabel(level)
      })
    )
  ];
}

function temperatureOptionsFor(
  definition: ShortAgentSubagentDefinition
): PopupSelectOption[] {
  const model = definition.modelId
    ? modelById.value.get(definition.modelId)
    : undefined;
  return (model?.temperatureOptions ?? [0.1, 0.7, 1]).map((temperature) => ({
    value: temperature,
    label: t("temperatureValue", {
      arg0: temperature
    })
  }));
}

function applyModelDefaults(
  definition: ShortAgentSubagentDefinition,
  modelId: string | undefined
): void {
  const model = modelId ? modelById.value.get(modelId) : undefined;
  definition.thinkingLevel = model?.defaultThinkingLevel ?? "medium";
  definition.temperature = model?.temperatureOptions[1] ?? 0.7;
}

function setModelMode(
  definition: ShortAgentSubagentDefinition,
  mode: ShortAgentSubagentModelMode
): void {
  if (formDisabled.value) return;
  definition.modelMode = mode;
  if (mode !== "custom") {
    delete definition.modelId;
    delete definition.thinkingLevel;
    delete definition.temperature;
    return;
  }
  if (!definition.modelId && props.models[0]) {
    definition.modelId = props.models[0].id;
  }
  if (definition.thinkingLevel === undefined) {
    applyModelDefaults(definition, definition.modelId);
  }
}

function setModelId(
  definition: ShortAgentSubagentDefinition,
  modelId: string
): void {
  if (formDisabled.value) return;
  definition.modelId = modelId;
  applyModelDefaults(definition, modelId);
}

function setThinkingLevel(
  definition: ShortAgentSubagentDefinition,
  level: ThinkingLevel
): void {
  if (formDisabled.value) return;
  definition.thinkingLevel = level;
  if (level === "off") {
    const options = temperatureOptionsFor(definition);
    if (
      definition.temperature === undefined ||
      !options.some((option) => Object.is(option.value, definition.temperature))
    ) {
      definition.temperature = Number(
        options[1]?.value ?? options[0]?.value ?? 0.7
      );
    }
  }
}

function setTemperature(
  definition: ShortAgentSubagentDefinition,
  temperature: number
): void {
  if (formDisabled.value) return;
  definition.temperature = temperature;
}

function nextSubagentId(): string {
  generatedIdSequence += 1;
  return `long_subagent_${Date.now().toString(36)}_${generatedIdSequence.toString(36)}`;
}

function addSubagent(
  draft?: Partial<
    Pick<ShortAgentSubagentDefinition, "name" | "description" | "systemPrompt">
  >
): void {
  const team = activeTeam.value;
  if (!team || formDisabled.value) return;
  if (team.subagents.length >= LONG_AGENT_SUBAGENT_MAX_COUNT) {
    uiMessage.warning(
      t("eachNovelPrimaryAgentSupportsUpToValueSubagents", {
        arg0: LONG_AGENT_SUBAGENT_MAX_COUNT
      })
    );
    return;
  }
  const id = nextSubagentId();
  const index = team.subagents.length + 1;
  team.subagents.push({
    id,
    name:
      draft?.name?.trim() ||
      t("newSubagentValue", {
        arg0: index
      }),
    description: draft?.description?.trim() || "",
    systemPrompt: draft?.systemPrompt?.trim() || "",
    enabled: true,
    modelMode: "inherit"
  });
  editingSubagentId.value = id;
}

function duplicateSubagent(index: number): void {
  const team = activeTeam.value;
  if (!team || formDisabled.value) return;
  const source = team.subagents[index];
  if (!source) return;
  if (team.subagents.length >= LONG_AGENT_SUBAGENT_MAX_COUNT) {
    uiMessage.warning(
      t("eachNovelPrimaryAgentSupportsUpToValueSubagents", {
        arg0: LONG_AGENT_SUBAGENT_MAX_COUNT
      })
    );
    return;
  }
  const copied = createCopiedSubagent(
    source,
    team.subagents,
    nextSubagentId(),
    SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH
  );
  team.subagents.splice(index + 1, 0, copied);
  uiMessage.info(t("copiedToTheCurrentDraftSaveTheAgentTeam"));
}

function openLoadFromSkill(): void {
  const team = activeTeam.value;
  if (!team || formDisabled.value) return;
  if (team.subagents.length >= LONG_AGENT_SUBAGENT_MAX_COUNT) {
    uiMessage.warning(
      t("eachNovelPrimaryAgentSupportsUpToValueSubagents", {
        arg0: LONG_AGENT_SUBAGENT_MAX_COUNT
      })
    );
    return;
  }
  if (!props.skills.length) {
    uiMessage.warning(t("theSkillLibraryIsEmptyAddAnEntryIn"));
    return;
  }
  loadFromSkillOpen.value = true;
}

function closeLoadFromSkill(): void {
  if (props.authoringGenerating) return;
  loadFromSkillOpen.value = false;
  emit("authoringReset");
}

function confirmLoadFromSkill(draft: SubagentAuthoringDraft): void {
  addSubagent(draft);
  loadFromSkillOpen.value = false;
  emit("authoringReset");
  uiMessage.success(t("addedToThePrimaryAgentDraftSaveTheAgent"));
}

function subagentModelSummary(
  definition: ShortAgentSubagentDefinition
): string {
  if (definition.modelMode !== "custom") return t("usePrimaryAgentModel");
  if (!definition.modelId) return t("separateConfigurationNoModelSelected");
  const modelLabel =
    modelById.value.get(definition.modelId)?.label ?? definition.modelId;
  const thinking =
    definition.thinkingLevel !== undefined
      ? thinkingLabel(definition.thinkingLevel)
      : undefined;
  if (!thinking) return modelLabel;
  if (
    definition.thinkingLevel === "off" &&
    definition.temperature !== undefined
  ) {
    return t("valueOffTemperatureValue", {
      arg0: modelLabel,
      arg1: definition.temperature
    });
  }
  return `${modelLabel} · ${thinking}`;
}

function editSubagent(id: string): void {
  editingSubagentId.value = id;
}

function finishEditing(): void {
  editingSubagentId.value = null;
}

function removeSubagent(index: number): void {
  const team = activeTeam.value;
  if (!team || formDisabled.value) return;
  const [removed] = team.subagents.splice(index, 1);
  if (removed && editingSubagentId.value === removed.id) {
    editingSubagentId.value = null;
  }
  if (removed) {
    uiMessage.info(t("removedFromTheCurrentDraftSaveTheAgentTeam"));
  }
}

function toggleSubagent(
  definition: ShortAgentSubagentDefinition,
  event: Event
): void {
  if (formDisabled.value) return;
  definition.enabled = (event.target as HTMLInputElement).checked;
}

function validationMessage(): string | null {
  for (const team of draftTeams.value) {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const definition of team.subagents) {
      if (!definition.name.trim()) return t("subagentNameIsRequired");
      if (!definition.description.trim())
        return t("subagentCapabilitiesAreRequired");
      if (!definition.systemPrompt.trim())
        return t("subagentSystemPromptIsRequired");
      if (definition.modelMode === "custom") {
        if (!definition.modelId?.trim())
          return t("selectAModelForASeparateConfiguration");
        const model = modelById.value.get(definition.modelId);
        if (!model) {
          return t("theModelSelectedForSubagentValueNoLongerExists", {
            arg0: definition.name.trim() || t("untitled")
          });
        }
        if (definition.thinkingLevel === undefined) {
          return t("selectAReasoningLevelForASeparateConfiguration");
        }
        if (
          definition.thinkingLevel !== "off" &&
          !model.thinkingLevelOptions.includes(definition.thinkingLevel)
        ) {
          return t("theReasoningLevelForSubagentValueIsNotAvailable", {
            arg0: definition.name.trim() || t("untitled")
          });
        }
        if (definition.thinkingLevel === "off") {
          if (definition.temperature === undefined) {
            return t("selectATemperatureWhenReasoningIsOff");
          }
          if (!model.temperatureOptions.includes(definition.temperature)) {
            return t("theTemperatureForSubagentValueIsNotAvailableIn", {
              arg0: definition.name.trim() || t("untitled")
            });
          }
        }
      }
      const normalizedId = definition.id.toLocaleLowerCase();
      const normalizedName = definition.name.trim().toLocaleLowerCase();
      if (ids.has(normalizedId)) {
        return t("subagentIDsMustBeUniqueWithinAPrimaryAgent");
      }
      if (names.has(normalizedName)) {
        return t("subagentNamesMustBeUniqueWithinAPrimaryAgent");
      }
      ids.add(normalizedId);
      names.add(normalizedName);
    }
  }
  return null;
}

function saveSettings(): void {
  if (formDisabled.value) return;
  const message = validationMessage();
  if (message) {
    uiMessage.warning(message);
    return;
  }
  const parsed = LongAgentTeamSettingsInputSchema.safeParse({
    workspaceType: "long",
    parallelSubagents: draftParallelSubagents.value,
    teams: LONG_AGENT_IDS.map((parentAgentId) => {
      const team = draftTeams.value.find(
        (candidate) => candidate.parentAgentId === parentAgentId
      );
      return {
        parentAgentId,
        subagents: (team?.subagents ?? []).map((definition) => ({
          id: definition.id,
          name: definition.name.trim(),
          description: definition.description.trim(),
          systemPrompt: definition.systemPrompt.trim(),
          enabled: definition.enabled,
          modelMode: definition.modelMode ?? "inherit",
          ...(definition.modelMode === "custom" && definition.modelId
            ? {
                modelId: definition.modelId.trim(),
                ...(definition.thinkingLevel !== undefined
                  ? { thinkingLevel: definition.thinkingLevel }
                  : {}),
                ...(definition.thinkingLevel === "off" &&
                definition.temperature !== undefined
                  ? { temperature: definition.temperature }
                  : {})
              }
            : {})
        }))
      };
    })
  });
  if (!parsed.success) {
    uiMessage.warning(t("novelAgentTeamSettingsAreIncomplete"));
    return;
  }
  emit("save", parsed.data);
}
// Expose bindings used by the separate editor template.
defineExpose({
  AgentTeamParallelSwitch,
  draftParallelSubagents,
  LONG_AGENT_SUBAGENT_MAX_COUNT,
  SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH,
  PARENT_AGENT_DESCRIPTION,
  parentAgentLabel,
  AppIcon,
  LoadSubagentFromSkillDialog,
  PopupSelect,
  modelOptions,
  thinkingOptionsFor,
  temperatureOptionsFor,
  openLoadFromSkill,
  addSubagent,
  subagentModelSummary,
  toggleSubagent,
  editSubagent,
  duplicateSubagent,
  removeSubagent,
  setModelMode,
  setModelId,
  setThinkingLevel,
  setTemperature,
  finishEditing,
  saveSettings,
  closeLoadFromSkill,
  confirmLoadFromSkill
});
</script>

<template src="./LongAgentTeamSettingsPanel.template.html"></template>

<style scoped src="./LongAgentTeamSettingsPanel.css"></style>
