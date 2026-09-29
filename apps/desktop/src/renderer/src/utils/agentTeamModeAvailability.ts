import { createScopedTranslator } from "../i18n";
import type {
  AgentTeamCatalogSnapshot,
  AgentTeamWorkspaceType
} from "@deepwrite/contracts";

const t = createScopedTranslator("workspace.agentTeamModeAvailability");

export interface AgentTeamModeAvailabilityInput {
  catalog: AgentTeamCatalogSnapshot | null;
  workspaceType: AgentTeamWorkspaceType;
  parentAgentId: string;
  loaded: boolean;
  loading: boolean;
  loadError: string | null;
}

export interface AgentTeamModeAvailability {
  available: boolean;
  description: string;
}

function enabledMemberCount(
  catalog: AgentTeamCatalogSnapshot,
  workspaceType: AgentTeamWorkspaceType,
  parentAgentId: string
): number {
  const enabledTeamId = catalog.enabledTeamIds[workspaceType];
  if (!enabledTeamId) return 0;

  if (workspaceType === "short") {
    const profile = catalog.teams.find(
      (team) => team.id === enabledTeamId && team.workspaceType === "short"
    );
    return (
      profile?.settings.teams
        .find((team) => team.parentAgentId === parentAgentId)
        ?.subagents.filter((member) => member.enabled).length ?? 0
    );
  }
  if (workspaceType === "script") {
    const profile = catalog.teams.find(
      (team) => team.id === enabledTeamId && team.workspaceType === "script"
    );
    return (
      profile?.settings.teams
        .find((team) => team.parentAgentId === parentAgentId)
        ?.subagents.filter((member) => member.enabled).length ?? 0
    );
  }
  const profile = catalog.teams.find(
    (team) => team.id === enabledTeamId && team.workspaceType === "long"
  );
  return (
    profile?.settings.teams
      .find((team) => team.parentAgentId === parentAgentId)
      ?.subagents.filter((member) => member.enabled).length ?? 0
  );
}

export function resolveAgentTeamModeAvailability(
  input: AgentTeamModeAvailabilityInput
): AgentTeamModeAvailability {
  if (input.loading) {
    return {
      available: false,
      description: t("loadingAgentTeamConfiguration")
    };
  }
  if (input.loadError) {
    return {
      available: false,
      description: t("failedToLoadAgentTeamsRetryFromTheAgent")
    };
  }
  if (!input.loaded || !input.catalog) {
    return {
      available: false,
      description: t("agentTeamConfigurationHasNotLoadedYet")
    };
  }
  if (
    enabledMemberCount(
      input.catalog,
      input.workspaceType,
      input.parentAgentId
    ) === 0
  ) {
    return {
      available: false,
      description: t("thisAgentHasNoEnabledTeamWithAvailableMembers")
    };
  }
  return {
    available: true,
    description: t("allowThisMainAgentToCallSubagentsInEnabled")
  };
}
