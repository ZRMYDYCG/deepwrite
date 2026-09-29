import { BUILTIN_AGENT_METADATA } from "@deepwrite/contracts/renderer";
import { t } from "./index";

export type BuiltinAgentKind =
  "short" | "script" | "long" | "material" | "skill";

/** UI-only metadata: never write translated labels into saved agent profiles. */
const defaultProfiles = BUILTIN_AGENT_METADATA;

export function builtinAgentLabel(
  kind: BuiltinAgentKind,
  storedLabel?: string
): string {
  if (storedLabel && storedLabel !== defaultProfiles[kind].label)
    return storedLabel;
  return t(`workspace.builtins.agents.${kind}`);
}

export function builtinAgentDescription(
  kind: BuiltinAgentKind,
  storedDescription?: string
): string {
  if (
    storedDescription &&
    storedDescription !== defaultProfiles[kind].description
  )
    return storedDescription;
  return t(`workspace.builtins.agentDescriptions.${kind}`);
}

export function builtinWelcomeShortcuts(
  kind: "short" | "script" | "long"
): readonly [string, string, string] {
  if (kind === "long") {
    return [
      t("workspace.builtins.shortcuts.longOrganize"),
      t("workspace.builtins.shortcuts.longReview"),
      t("workspace.builtins.shortcuts.longWrite")
    ];
  }
  return [
    t(
      kind === "short"
        ? "workspace.builtins.shortcuts.shortContinue"
        : "workspace.builtins.shortcuts.scriptContinue"
    ),
    t(
      kind === "short"
        ? "workspace.builtins.shortcuts.shortReview"
        : "workspace.builtins.shortcuts.scriptReview"
    ),
    t("workspace.builtins.shortcuts.writeFromReferences")
  ];
}
