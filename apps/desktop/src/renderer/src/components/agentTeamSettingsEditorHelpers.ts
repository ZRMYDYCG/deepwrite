import { createScopedTranslator } from "../i18n";
import {
  BUILT_IN_REASONING_LEVELS,
  type BuiltInReasoningLevel,
  type ModelConfig,
  type ShortAgentSubagentDefinition,
  type ThinkingLevel,
  type WorkspaceAgentTeamSettingsInput
} from "@deepwrite/contracts";
import { BUILT_IN_THINKING_LABELS } from "./agentTeamSettingsMeta";

const t = createScopedTranslator("components.agentTeamSettingsEditorHelpers");

export function agentTeamThinkingLabel(level: ThinkingLevel): string {
  if (level === "off") return t("off");
  return BUILT_IN_REASONING_LEVELS.includes(level as BuiltInReasoningLevel)
    ? BUILT_IN_THINKING_LABELS[level as BuiltInReasoningLevel]
    : t("customValue", {
        arg0: level
      });
}

export function agentTeamModelDefaults(model: ModelConfig | undefined): {
  thinkingLevel: ThinkingLevel;
  temperature: number;
} {
  return {
    thinkingLevel: model?.defaultThinkingLevel ?? "medium",
    temperature: model?.temperatureOptions[1] ?? 0.7
  };
}

export function nextCopiedSubagentName(
  name: string,
  existingNames: readonly string[],
  maxLength: number
): string {
  const trimmed = name.trim() || t("untitledSubagent");
  const existing = new Set(
    existingNames.map((item) => item.trim().toLocaleLowerCase())
  );
  const numbered = trimmed.match(/^(.*) (\d+)$/);
  const base = numbered?.[1]?.trim() || trimmed;
  let index = numbered ? Number(numbered[2]) + 1 : 2;

  for (let attempt = 0; attempt < 10_000; attempt += 1, index += 1) {
    const suffix = ` ${index}`;
    const allowedBaseLength = Math.max(1, maxLength - suffix.length);
    const candidateBase =
      base.length <= allowedBaseLength
        ? base
        : base.slice(0, allowedBaseLength).trimEnd();
    const candidate = `${candidateBase}${suffix}`.slice(0, maxLength);
    if (!existing.has(candidate.toLocaleLowerCase())) {
      return candidate;
    }
  }

  return `${base} ${Date.now()}`.slice(0, maxLength);
}

export function createCopiedSubagent(
  source: ShortAgentSubagentDefinition,
  existing: readonly Pick<ShortAgentSubagentDefinition, "name">[],
  nextId: string,
  maxNameLength: number
): ShortAgentSubagentDefinition {
  return {
    ...source,
    id: nextId,
    name: nextCopiedSubagentName(
      source.name,
      existing.map((item) => item.name),
      maxNameLength
    )
  };
}

export function validateAgentTeamDraft(
  teams: WorkspaceAgentTeamSettingsInput["teams"],
  models: readonly ModelConfig[]
): string | null {
  for (const team of teams) {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const subagent of team.subagents) {
      if (!subagent.name.trim()) return t("subagentNameIsRequired");
      if (!subagent.description.trim())
        return t("subagentCapabilitiesAreRequired");
      if (!subagent.systemPrompt.trim())
        return t("subagentSystemPromptIsRequired");
      if (subagent.modelMode === "custom") {
        if (!subagent.modelId?.trim())
          return t("selectAModelForASeparateConfiguration");
        const model = models.find(
          (candidate) => candidate.id === subagent.modelId
        );
        if (!model) {
          return t("theModelSelectedForSubagentValueNoLongerExists", {
            arg0: subagent.name.trim() || t("untitled")
          });
        }
        if (subagent.thinkingLevel === undefined) {
          return t("selectAReasoningLevelForASeparateConfiguration");
        }
        if (
          subagent.thinkingLevel !== "off" &&
          !model.thinkingLevelOptions.includes(subagent.thinkingLevel)
        ) {
          return t("theReasoningLevelForSubagentValueIsNotAvailable", {
            arg0: subagent.name.trim() || t("untitled")
          });
        }
        if (subagent.thinkingLevel === "off") {
          if (subagent.temperature === undefined) {
            return t("selectATemperatureWhenReasoningIsOff");
          }
          if (!model.temperatureOptions.includes(subagent.temperature)) {
            return t("theTemperatureForSubagentValueIsNotAvailableIn", {
              arg0: subagent.name.trim() || t("untitled")
            });
          }
        }
      }
      const id = subagent.id.toLocaleLowerCase();
      const name = subagent.name.trim().toLocaleLowerCase();
      if (ids.has(id)) return t("subagentIDsMustBeUniqueWithinAPrimaryAgent");
      if (names.has(name))
        return t("subagentNamesMustBeUniqueWithinAPrimaryAgent");
      ids.add(id);
      names.add(name);
    }
  }
  return null;
}
