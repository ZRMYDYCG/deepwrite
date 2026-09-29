import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import type { WorkspaceDirectorySettings } from "@deepwrite/contracts";
import type { WorkspaceFeatureHostCoordinatorOptions } from "./workspaceFeatureHostTypes";

const t = createScopedTranslator("workspace.workspaceDirectorySettings");

type WorkspaceDirectoryContext = Pick<
  WorkspaceFeatureHostCoordinatorOptions,
  "api" | "settingsStore" | "notifications"
>;

export function useWorkspaceDirectorySettings(
  context: WorkspaceDirectoryContext
) {
  const { settingsStore } = context;
  let disposed = false;
  let changing = false;

  function showError(error: unknown, fallback: string): void {
    if (!disposed) {
      context.notifications.error(formatError(error, fallback));
    }
  }

  async function loadWorkspaceDirectory(): Promise<void> {
    const api = context.api();
    if (!api || disposed) return;
    try {
      await settingsStore.ensureWorkspaceDirectoryLoaded(() =>
        api.workspaceDirectory.list()
      );
    } catch (error) {
      showError(error, t("failedToLoadTheWorkingDirectory"));
    }
  }

  async function updateDirectory(
    operation: () => Promise<WorkspaceDirectorySettings | null>,
    successMessage: string
  ): Promise<void> {
    if (disposed || changing || settingsStore.workspaceDirectoryLoading) return;
    changing = true;
    settingsStore.workspaceDirectoryLoading = true;
    try {
      const settings = await operation();
      if (disposed || !settings) return;
      settingsStore.markLoaded("workspaceDirectory", settings);
      context.notifications.success(successMessage);
    } catch (error) {
      showError(error, t("failedToChangeTheWorkingDirectory"));
    } finally {
      changing = false;
      if (!disposed) settingsStore.workspaceDirectoryLoading = false;
    }
  }

  async function chooseWorkspaceDirectory(): Promise<void> {
    const api = context.api();
    if (!api) return;
    await updateDirectory(
      () => api.workspaceDirectory.choose(),
      t("workingDirectoryChangedExistingProjectsRemainInTheirOriginal")
    );
  }

  async function resetWorkspaceDirectory(): Promise<void> {
    const api = context.api()?.storageSettings;
    if (!api) return;
    await updateDirectory(
      () => api.resetWorkspaceDirectory(),
      t("workingDirectoryRestoredToItsDefaultLocationExistingProjects")
    );
  }

  function dispose(): void {
    disposed = true;
    if (changing) settingsStore.workspaceDirectoryLoading = false;
  }

  return {
    loadWorkspaceDirectory,
    chooseWorkspaceDirectory,
    resetWorkspaceDirectory,
    dispose
  };
}
