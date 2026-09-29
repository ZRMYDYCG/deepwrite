import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import type {
  DeepWriteApi,
  AgentTeamProfileCreateInput,
  AgentTeamProfileRenameInput,
  AgentTeamProfileSaveInput,
  AgentTeamProfileSetEnabledInput,
  AgentTeamProfileTargetInput,
  LibraryAgentDomain,
  LibraryAgentSettingsInput,
  LongAgentSettingsInput,
  WorkspaceAgentSettingsInput
} from "@deepwrite/contracts";
import { useSettingsStore } from "../stores/settingsStore";
import {
  useModelSettingsCoordinator,
  type ModelSettingsNotifications
} from "./useModelSettingsCoordinator";

const t = createScopedTranslator("workspace");

export type SettingsFeatureNotifications = ModelSettingsNotifications;

export interface SettingsFeatureCoordinatorContext {
  api(): DeepWriteApi | undefined;
  settingsStore: ReturnType<typeof useSettingsStore>;
  notifications: SettingsFeatureNotifications;
  onModelsLoaded: Parameters<
    typeof useModelSettingsCoordinator
  >[0]["onModelsLoaded"];
}

function errorMessage(error: unknown, fallback: string): string {
  return formatError(error, fallback);
}

export function useSettingsFeatureCoordinator(
  context: SettingsFeatureCoordinatorContext
) {
  const { settingsStore, notifications: uiMessage } = context;
  const modelSettingsCoordinator = useModelSettingsCoordinator(context);
  async function loadShortAndScriptAgentSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      await settingsStore.ensureWorkspaceAgentsLoaded(() =>
        Promise.all([
          api.workspaceAgents.list("short"),
          api.workspaceAgents.list("script")
        ])
      );
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToLoadWorkspaceAgentSettings")
        )
      );
    }
  }

  async function loadLongAgentSettings(): Promise<boolean> {
    const api = context.api();
    if (!api) return false;
    try {
      await settingsStore.ensureLongAgentsLoaded(() => api.longAgents.list());
      return true;
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToLoadNovelAgentSettings")
        )
      );
      return false;
    }
  }

  async function ensureLongAgentSettingsLoaded(): Promise<boolean> {
    return settingsStore.longAgentLoaded || (await loadLongAgentSettings());
  }

  async function loadWorkspaceAgentSettings(): Promise<void> {
    await Promise.all([
      loadShortAndScriptAgentSettings(),
      loadLongAgentSettings()
    ]);
  }

  async function saveWorkspaceAgentSettings(
    settings: WorkspaceAgentSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.workspaceAgentSaving) return;
    settingsStore.workspaceAgentSaving = true;
    try {
      const saved = await api.workspaceAgents.save(settings);
      settingsStore.markLoaded("workspaceAgents", [
        ...settingsStore.workspaceAgentSettings.filter(
          (candidate) => candidate.workspaceType !== saved.workspaceType
        ),
        saved
      ]);
      uiMessage.success(
        t(
          "settingsFeatureCoordinator.savedAgentPromptsWelcomeShortcutsAndReadPermissionsChanges",
          {
            value:
              saved.workspaceType === "script"
                ? t("catalogWorkspace.screenplay")
                : t("catalogWorkspace.shortStory")
          }
        )
      );
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToSaveWorkspaceAgentSettings")
        )
      );
    } finally {
      settingsStore.workspaceAgentSaving = false;
    }
  }

  async function saveLongAgentSettings(
    settings: LongAgentSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.longAgentSaving) return;
    settingsStore.longAgentSaving = true;
    try {
      const saved = await api.longAgents.save(settings);
      settingsStore.markLoaded("longAgents", saved);
      uiMessage.success(
        t(
          "settingsFeatureCoordinator.savedPromptsWelcomeShortcutsAndMaterialSkillReadPermissions"
        )
      );
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToSaveNovelAgentSettings")
        )
      );
    } finally {
      settingsStore.longAgentSaving = false;
    }
  }

  async function loadAgentTeamSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      await settingsStore.ensureAgentTeamsLoaded(() => api.agentTeams.list());
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToLoadAgentTeamSettings")
        )
      );
    }
  }

  async function mutateAgentTeamCatalog(
    operation: () => ReturnType<DeepWriteApi["agentTeams"]["list"]>,
    successMessage: string,
    fallbackMessage: string
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.agentTeamSaving) return;
    settingsStore.agentTeamSaving = true;
    try {
      settingsStore.markLoaded("agentTeams", await operation());
      uiMessage.success(successMessage);
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, fallbackMessage));
    } finally {
      settingsStore.agentTeamSaving = false;
    }
  }

  async function createAgentTeam(
    input: AgentTeamProfileCreateInput
  ): Promise<void> {
    const api = context.api();
    if (!api) return;
    await mutateAgentTeamCatalog(
      () => api.agentTeams.create(input),
      t("settingsFeatureCoordinator.agentTeamCreated"),
      t("settingsFeatureCoordinator.failedToCreateAgentTeam")
    );
  }

  async function renameAgentTeam(
    input: AgentTeamProfileRenameInput
  ): Promise<void> {
    const api = context.api();
    if (!api) return;
    await mutateAgentTeamCatalog(
      () => api.agentTeams.rename(input),
      t("settingsFeatureCoordinator.agentTeamRenamed"),
      t("settingsFeatureCoordinator.failedToRenameAgentTeam")
    );
  }

  async function deleteAgentTeam(
    input: AgentTeamProfileTargetInput
  ): Promise<void> {
    const api = context.api();
    if (!api) return;
    await mutateAgentTeamCatalog(
      () => api.agentTeams.delete(input),
      t("settingsFeatureCoordinator.agentTeamDeleted"),
      t("settingsFeatureCoordinator.failedToDeleteAgentTeam")
    );
  }

  async function setAgentTeamEnabled(
    input: AgentTeamProfileSetEnabledInput
  ): Promise<void> {
    const api = context.api();
    if (!api) return;
    await mutateAgentTeamCatalog(
      () => api.agentTeams.setEnabled(input),
      input.enabled
        ? t("settingsFeatureCoordinator.teamEnabledItWillBeUsedForTheNext")
        : t("settingsFeatureCoordinator.teamDisabledItWillNoLongerBeUsedFor"),
      t("settingsFeatureCoordinator.failedToUpdateTeamStatus")
    );
  }

  async function saveAgentTeamSettings(
    input: AgentTeamProfileSaveInput
  ): Promise<void> {
    const api = context.api();
    if (!api) return;
    await mutateAgentTeamCatalog(
      () => api.agentTeams.save(input),
      t("settingsFeatureCoordinator.agentTeamSaved"),
      t("settingsFeatureCoordinator.failedToSaveAgentTeamSettings")
    );
  }

  async function downloadAgentTeam(
    input: AgentTeamProfileTargetInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.agentTeamSaving) return;
    settingsStore.agentTeamSaving = true;
    try {
      const result = await api.agentTeams.download(input);
      if (result.status === "saved") {
        uiMessage.success(
          t("settingsFeatureCoordinator.agentTeamArchiveDownloaded")
        );
      }
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToDownloadAgentTeam")
        )
      );
    } finally {
      settingsStore.agentTeamSaving = false;
    }
  }

  async function installAgentTeam(): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.agentTeamSaving) return;
    settingsStore.agentTeamSaving = true;
    try {
      const result = await api.agentTeams.install();
      if (result.status === "installed") {
        settingsStore.markLoaded("agentTeams", result.catalog);
        uiMessage.success(
          t("settingsFeatureCoordinator.agentTeamInstalled", {
            teamName: result.teamName
          })
        );
      }
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToInstallAgentTeam")
        )
      );
    } finally {
      settingsStore.agentTeamSaving = false;
    }
  }

  async function loadLibraryAgentSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      await settingsStore.ensureLibraryAgentsLoaded(() =>
        api.libraryAgents.list()
      );
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToLoadLibraryAgentSettings")
        )
      );
    }
  }

  async function saveLibraryAgentSettings(
    settings: LibraryAgentSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.libraryAgentSaving) return;
    settingsStore.libraryAgentSaving = true;
    try {
      const saved = await api.libraryAgents.save(settings);
      settingsStore.markLoaded("libraryAgents", saved);
      uiMessage.success(
        t(
          "settingsFeatureCoordinator.libraryAgentSettingsSavedChangesApplyToTheNext"
        )
      );
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToSaveLibraryAgentSettings")
        )
      );
    } finally {
      settingsStore.libraryAgentSaving = false;
    }
  }

  async function resetLibraryAgentSettings(
    domain: LibraryAgentDomain
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.libraryAgentSaving) return;
    settingsStore.libraryAgentSaving = true;
    try {
      const saved = await api.libraryAgents.reset(domain);
      settingsStore.markLoaded("libraryAgents", saved);
      uiMessage.success(
        t("settingsFeatureCoordinator.agentSettingsRestoredToDefaults", {
          value:
            domain === "skill"
              ? t("catalogWorkspace.skillLibrary")
              : t("catalogWorkspace.materialLibrary")
        })
      );
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("settingsFeatureCoordinator.failedToRestoreLibraryAgentDefaults")
        )
      );
    } finally {
      settingsStore.libraryAgentSaving = false;
    }
  }

  return {
    ...modelSettingsCoordinator,
    loadShortAndScriptAgentSettings,
    loadLongAgentSettings,
    ensureLongAgentSettingsLoaded,
    loadWorkspaceAgentSettings,
    saveWorkspaceAgentSettings,
    saveLongAgentSettings,
    loadAgentTeamSettings,
    createAgentTeam,
    renameAgentTeam,
    deleteAgentTeam,
    setAgentTeamEnabled,
    saveAgentTeamSettings,
    downloadAgentTeam,
    installAgentTeam,
    loadLibraryAgentSettings,
    saveLibraryAgentSettings,
    resetLibraryAgentSettings
  };
}
