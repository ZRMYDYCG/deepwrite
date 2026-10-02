<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  WorkspaceAgentTeamSettingsInputSchema,
  BUILT_IN_REASONING_LEVELS,
  SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_MAX_COUNT,
  SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH,
  SCRIPT_AGENT_SUBAGENT_MAX_COUNT,
  SCRIPT_WORKSPACE_AGENT_IDS,
  SHORT_WORKSPACE_AGENT_IDS,
  type WorkspaceAgentTeamSettings,
  type WorkspaceAgentTeamSettingsInput,
  type ModelConfig,
  type LongAgentTeamSettings,
  type LongAgentTeamSettingsInput,
  type ShortAgentSubagentDefinition,
  type ShortAgentSubagentModelMode,
  type WorkspaceAgentId,
  type SkillLibrary,
  type SubagentAuthoringDraft,
  type SubagentAuthoringRuntimeContext,
  type ThinkingLevel
} from "@deepwrite/contracts";
import { computed, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";
import AgentTeamParallelSwitch from "./AgentTeamParallelSwitch.vue";
import LoadSubagentFromSkillDialog from "./LoadSubagentFromSkillDialog.vue";
import LongAgentTeamSettingsPanel from "./LongAgentTeamSettingsPanel.vue";
import PopupSelect, { type PopupSelectOption } from "./PopupSelect.vue";
import {
  SCRIPT_PARENT_AGENTS,
  SHORT_PARENT_AGENT
} from "./agentTeamSettingsMeta";
import {
  agentTeamModelDefaults,
  agentTeamThinkingLabel,
  createCopiedSubagent,
  validateAgentTeamDraft
} from "./agentTeamSettingsEditorHelpers";

const t = createScopedTranslator("components.agentTeamSettingsPanel");

const props = defineProps<{
  workspaceType?: "short" | "script" | "long";
  settings: readonly WorkspaceAgentTeamSettings[];
  longSettings: LongAgentTeamSettings | null;
  models: readonly ModelConfig[];
  skills?: readonly SkillLibrary[];
  preferredModelId?: string | null | undefined;
  loading: boolean;
  saving: boolean;
  loadError?: string | null;
  longLoading: boolean;
  longSaving: boolean;
  longLoadError?: string | null;
  runtimeAvailable: boolean;
  authoringGenerating?: boolean;
  authoringDraft?: SubagentAuthoringDraft | null | undefined;
  authoringStatusText?: string | null | undefined;
  authoringError?: string | null | undefined;
}>();

const emit = defineEmits<{
  retry: [];
  save: [settings: WorkspaceAgentTeamSettingsInput];
  saveLong: [settings: LongAgentTeamSettingsInput];
  authoringGenerate: [
    payload: {
      context: SubagentAuthoringRuntimeContext;
      modelId: string;
    }
  ];
  authoringStop: [];
  authoringReset: [];
}>();

const loadFromSkillOpen = ref(false);

const activeParentAgentId = ref<WorkspaceAgentId>(SHORT_PARENT_AGENT.id);
const activeWorkspaceType = ref<"short" | "script" | "long">(
  props.workspaceType ?? "short"
);
type EditableTeam = {
  parentAgentId: WorkspaceAgentId;
  subagents: ShortAgentSubagentDefinition[];
};
const draftTeams = ref<EditableTeam[]>([]);
const draftParallelSubagents = ref(false);
const editingSubagentId = ref<string | null>(null);
let generatedIdSequence = 0;

const formDisabled = computed(
  () => props.loading || props.saving || !props.runtimeAvailable
);

const activeParentMeta = computed(
  () =>
    visibleParentAgents.value.find(
      (agent) => agent.id === activeParentAgentId.value
    ) ?? visibleParentAgents.value[0]!
);
const activeParentDisplayLabel = computed(() => activeParentMeta.value.label);

const visibleParentAgents = computed(() =>
  activeWorkspaceType.value === "script"
    ? SCRIPT_PARENT_AGENTS
    : [SHORT_PARENT_AGENT]
);

const activeSubagentLimit = computed(() =>
  activeWorkspaceType.value === "script"
    ? SCRIPT_AGENT_SUBAGENT_MAX_COUNT
    : SHORT_AGENT_SUBAGENT_MAX_COUNT
);

const activeSettings = computed(() =>
  activeWorkspaceType.value === "long"
    ? undefined
    : props.settings.find(
        (settings) => settings.workspaceType === activeWorkspaceType.value
      )
);

const activeSkills = computed(() => props.skills ?? []);

const activeTeam = computed(() =>
  draftTeams.value.find(
    (team) => team.parentAgentId === activeParentAgentId.value
  )
);

const modelOptions = computed<PopupSelectOption[]>(() =>
  props.models.map((model) => ({ value: model.id, label: model.label }))
);

const modelById = computed(() => {
  const map = new Map<string, ModelConfig>();
  for (const model of props.models) {
    map.set(model.id, model);
  }
  return map;
});

function thinkingOptionsFor(
  subagent: ShortAgentSubagentDefinition
): PopupSelectOption[] {
  const model = subagent.modelId
    ? modelById.value.get(subagent.modelId)
    : undefined;
  if (!model) {
    return [
      { value: "off", label: agentTeamThinkingLabel("off") },
      ...BUILT_IN_REASONING_LEVELS.map((value) => ({
        value,
        label: agentTeamThinkingLabel(value)
      }))
    ];
  }
  return [
    { value: "off", label: agentTeamThinkingLabel("off") },
    ...model.thinkingLevelOptions.map((value) => ({
      value,
      label: agentTeamThinkingLabel(value)
    }))
  ];
}

function temperatureOptionsFor(
  subagent: ShortAgentSubagentDefinition
): PopupSelectOption[] {
  const model = subagent.modelId
    ? modelById.value.get(subagent.modelId)
    : undefined;
  return (model?.temperatureOptions ?? [0.1, 0.7, 1]).map((value) => ({
    value,
    label: t("temperatureValue", {
      arg0: value
    })
  }));
}

function applyModelRunDefaults(
  subagent: ShortAgentSubagentDefinition,
  modelId: string | undefined
): void {
  const defaults = agentTeamModelDefaults(
    modelId ? modelById.value.get(modelId) : undefined
  );
  subagent.thinkingLevel = defaults.thinkingLevel;
  subagent.temperature = defaults.temperature;
}

watch(
  () => props.workspaceType,
  (workspaceType) => {
    if (workspaceType) {
      activeWorkspaceType.value = workspaceType;
      if (workspaceType === "short") {
        activeParentAgentId.value = SHORT_PARENT_AGENT.id;
      }
    }
  }
);

watch(
  () => [props.settings, activeWorkspaceType.value] as const,
  () => {
    const settings = activeSettings.value;
    draftParallelSubagents.value = settings?.parallelSubagents ?? false;
    draftTeams.value = settings
      ? settings.teams.map((team) => ({
          parentAgentId: team.parentAgentId,
          subagents: team.subagents.map((subagent) => ({
            ...subagent,
            modelMode: subagent.modelMode ?? "inherit",
            ...(subagent.modelId ? { modelId: subagent.modelId } : {}),
            ...(subagent.thinkingLevel !== undefined
              ? { thinkingLevel: subagent.thinkingLevel }
              : {}),
            ...(subagent.temperature !== undefined
              ? { temperature: subagent.temperature }
              : {})
          }))
        }))
      : [];
    if (
      settings &&
      !settings.teams.some(
        (team) => team.parentAgentId === activeParentAgentId.value
      )
    ) {
      activeParentAgentId.value = visibleParentAgents.value[0]!.id;
    }
    editingSubagentId.value = null;
  },
  { immediate: true, deep: true }
);

function selectParentAgent(parentAgentId: WorkspaceAgentId): void {
  activeParentAgentId.value = parentAgentId;
  editingSubagentId.value = null;
}

function nextSubagentId(): string {
  generatedIdSequence += 1;
  return `subagent_${Date.now().toString(36)}_${generatedIdSequence.toString(36)}`;
}

function addSubagent(
  draft?: Partial<
    Pick<ShortAgentSubagentDefinition, "name" | "description" | "systemPrompt">
  >
): void {
  const team = activeTeam.value;
  if (!team || formDisabled.value) return;
  if (team.subagents.length >= activeSubagentLimit.value) {
    uiMessage.warning(
      t("thisTeamSupportsUpToValueSubagents", {
        arg0: activeSubagentLimit.value
      })
    );
    return;
  }
  const id = nextSubagentId();
  const index = team.subagents.length + 1;
  team.subagents.push({
    id,
    name: draft?.name?.trim() || t("newSubagentValue", { arg0: index }),
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
  if (team.subagents.length >= activeSubagentLimit.value) {
    uiMessage.warning(
      t("thisTeamSupportsUpToValueSubagents", {
        arg0: activeSubagentLimit.value
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
  if (formDisabled.value) return;
  if (!activeTeam.value) return;
  if (activeTeam.value.subagents.length >= activeSubagentLimit.value) {
    uiMessage.warning(
      t("thisTeamSupportsUpToValueSubagents", {
        arg0: activeSubagentLimit.value
      })
    );
    return;
  }
  if (!activeSkills.value.length) {
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

function setSubagentModelMode(
  subagent: ShortAgentSubagentDefinition,
  mode: ShortAgentSubagentModelMode
): void {
  if (formDisabled.value) return;
  subagent.modelMode = mode;
  if (mode !== "custom") {
    delete subagent.modelId;
    delete subagent.thinkingLevel;
    delete subagent.temperature;
    return;
  }
  if (!subagent.modelId && props.models[0]) {
    subagent.modelId = props.models[0].id;
  }
  if (subagent.thinkingLevel === undefined) {
    applyModelRunDefaults(subagent, subagent.modelId);
  }
}

function setSubagentModelId(
  subagent: ShortAgentSubagentDefinition,
  modelId: string
): void {
  if (formDisabled.value) return;
  subagent.modelId = modelId;
  applyModelRunDefaults(subagent, modelId);
}

function setSubagentThinkingLevel(
  subagent: ShortAgentSubagentDefinition,
  rawLevel: string
): void {
  if (formDisabled.value) return;
  const level = rawLevel as ThinkingLevel;
  subagent.thinkingLevel = level;
  if (level === "off") {
    const options = temperatureOptionsFor(subagent);
    const current = subagent.temperature;
    if (
      current === undefined ||
      !options.some((option) => Object.is(option.value, current))
    ) {
      subagent.temperature = Number(
        options[1]?.value ?? options[0]?.value ?? 0.7
      );
    }
  }
}

function setSubagentTemperature(
  subagent: ShortAgentSubagentDefinition,
  temperature: number
): void {
  if (formDisabled.value) return;
  subagent.temperature = temperature;
}

function subagentModelSummary(subagent: ShortAgentSubagentDefinition): string {
  if (subagent.modelMode !== "custom") return t("usePrimaryAgentModel");
  if (!subagent.modelId) return t("separateConfigurationNoModelSelected");
  const modelLabel =
    modelById.value.get(subagent.modelId)?.label ?? subagent.modelId;
  const thinking =
    subagent.thinkingLevel !== undefined
      ? agentTeamThinkingLabel(subagent.thinkingLevel)
      : undefined;
  if (!thinking) return modelLabel;
  if (subagent.thinkingLevel === "off" && subagent.temperature !== undefined) {
    return t("valueOffTemperatureValue", {
      arg0: modelLabel,
      arg1: subagent.temperature
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
  subagent: ShortAgentSubagentDefinition,
  event: Event
): void {
  if (formDisabled.value) return;
  subagent.enabled = (event.target as HTMLInputElement).checked;
}

function saveSettings(): void {
  if (formDisabled.value || activeWorkspaceType.value === "long") return;
  const workspaceType = activeWorkspaceType.value;
  const parentAgentIds =
    workspaceType === "script"
      ? SCRIPT_WORKSPACE_AGENT_IDS
      : SHORT_WORKSPACE_AGENT_IDS;
  const teams = parentAgentIds.map((parentAgentId) => {
    const team = draftTeams.value.find(
      (candidate) => candidate.parentAgentId === parentAgentId
    );
    return {
      parentAgentId,
      subagents: (team?.subagents ?? []).map((subagent) => ({
        id: subagent.id,
        name: subagent.name.trim(),
        description: subagent.description.trim(),
        systemPrompt: subagent.systemPrompt.trim(),
        enabled: subagent.enabled,
        modelMode: subagent.modelMode ?? "inherit",
        ...(subagent.modelMode === "custom" && subagent.modelId
          ? {
              modelId: subagent.modelId.trim(),
              ...(subagent.thinkingLevel !== undefined
                ? { thinkingLevel: subagent.thinkingLevel }
                : {}),
              ...(subagent.thinkingLevel === "off" &&
              subagent.temperature !== undefined
                ? { temperature: subagent.temperature }
                : {})
            }
          : {})
      }))
    };
  });
  const message = validateAgentTeamDraft(
    teams as WorkspaceAgentTeamSettingsInput["teams"],
    props.models
  );
  if (message) {
    uiMessage.warning(message);
    return;
  }
  const parsed = WorkspaceAgentTeamSettingsInputSchema.safeParse({
    workspaceType,
    parallelSubagents: draftParallelSubagents.value,
    teams
  });
  if (!parsed.success) {
    uiMessage.warning(t("agentTeamConfigurationIsIncomplete"));
    return;
  }
  emit("save", parsed.data);
}

// The template is kept in a separate file to keep this editor maintainable.
// Exposing its bindings also gives static analysis an explicit cross-file boundary.
defineExpose({
  AgentTeamParallelSwitch,
  draftParallelSubagents,
  SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH,
  AppIcon,
  LoadSubagentFromSkillDialog,
  LongAgentTeamSettingsPanel,
  PopupSelect,
  activeParentDisplayLabel,
  activeSubagentLimit,
  visibleParentAgents,
  modelOptions,
  thinkingOptionsFor,
  selectParentAgent,
  openLoadFromSkill,
  closeLoadFromSkill,
  confirmLoadFromSkill,
  setSubagentModelMode,
  setSubagentModelId,
  setSubagentThinkingLevel,
  setSubagentTemperature,
  subagentModelSummary,
  editSubagent,
  finishEditing,
  duplicateSubagent,
  removeSubagent,
  toggleSubagent,
  saveSettings
});
</script>

<template src="./AgentTeamSettingsPanel.template.html"></template>

<style scoped src="./AgentTeamSettingsPanel.css"></style>
