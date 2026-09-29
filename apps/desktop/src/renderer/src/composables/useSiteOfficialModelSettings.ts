import { createScopedTranslator } from "../i18n";
import {
  beginSiteOfficialQuotaRequest,
  invalidateSiteOfficialQuota
} from "./siteOfficialQuotaRequests";
import type { DeepWriteApi, ModelSettings } from "@deepwrite/contracts";
import { isDeepWriteSiteOfficialModel } from "@deepwrite/contracts/renderer";
import { useSettingsStore } from "../stores/settingsStore";

const t = createScopedTranslator("workspace");

interface SiteOfficialNotifications {
  error(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

interface SiteOfficialModelSettingsContext {
  api(): DeepWriteApi | undefined;
  settingsStore: ReturnType<typeof useSettingsStore>;
  notifications: SiteOfficialNotifications;
  applyLoadedModelSettings(settings: ModelSettings): void;
  loadModelSettings(): Promise<void>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error
    ? error.message.replace(/^models\.[a-z_]+:\s*/u, "")
    : fallback;
}

export function useSiteOfficialModelSettings(
  context: SiteOfficialModelSettingsContext
) {
  const { settingsStore, notifications: uiMessage } = context;

  async function queryQuota(api: DeepWriteApi): Promise<boolean> {
    const current = beginSiteOfficialQuotaRequest(settingsStore);
    try {
      const quota = await api.models.querySiteOfficialQuota();
      if (!current()) return false;
      settingsStore.siteOfficialQuota = quota;
      return true;
    } catch (error: unknown) {
      if (current()) {
        settingsStore.siteOfficialQuota = null;
        uiMessage.warning(
          errorMessage(
            error,
            t(
              "siteOfficialModelSettings.couldNotRetrieveTheNewOfficialSiteSBalance"
            )
          )
        );
      }
      return false;
    }
  }

  async function loadSiteOfficialModels(): Promise<void> {
    if (
      settingsStore.siteOfficialModelsSaving ||
      settingsStore.siteOfficialModelsRefreshing
    )
      return;
    await context.loadModelSettings();
    if (
      settingsStore.siteOfficialModelsSaving ||
      settingsStore.siteOfficialModelsRefreshing
    )
      return;
    const api = context.api();
    const configured = settingsStore.modelSettings?.models.some(
      (model) => isDeepWriteSiteOfficialModel(model) && model.hasApiKey
    );
    if (!api || !configured) {
      settingsStore.siteOfficialQuota = null;
      return;
    }
    await queryQuota(api);
  }

  async function saveSiteOfficialToken(apiKey: string): Promise<void> {
    const api = context.api();
    if (
      !api ||
      settingsStore.siteOfficialModelsSaving ||
      settingsStore.siteOfficialModelsRefreshing
    )
      return;
    invalidateSiteOfficialQuota(settingsStore);
    settingsStore.siteOfficialQuota = null;
    settingsStore.siteOfficialModelsSaving = true;
    settingsStore.modelError = null;
    try {
      const settings = await api.models.saveSiteOfficialToken(apiKey);
      context.applyLoadedModelSettings(settings);
      await queryQuota(api);
      uiMessage.success(
        t("siteOfficialModelSettings.theNewOfficialSiteSModelKeyHasBeen")
      );
    } catch (error: unknown) {
      settingsStore.modelError = errorMessage(
        error,
        t("siteOfficialModelSettings.couldNotSaveTheNewOfficialSiteSModel")
      );
      uiMessage.error(settingsStore.modelError);
    } finally {
      settingsStore.siteOfficialModelsSaving = false;
    }
  }

  async function clearSiteOfficialToken(): Promise<void> {
    const api = context.api();
    if (
      !api ||
      settingsStore.siteOfficialModelsSaving ||
      settingsStore.siteOfficialModelsRefreshing
    )
      return;
    invalidateSiteOfficialQuota(settingsStore);
    settingsStore.siteOfficialQuota = null;
    settingsStore.siteOfficialModelsSaving = true;
    settingsStore.modelError = null;
    try {
      const settings = await api.models.clearSiteOfficialToken();
      context.applyLoadedModelSettings(settings);
      settingsStore.siteOfficialQuota = null;
      uiMessage.info(
        t("siteOfficialModelSettings.theNewOfficialSiteSModelKeyWasRemoved")
      );
    } catch (error: unknown) {
      settingsStore.modelError = errorMessage(
        error,
        t("siteOfficialModelSettings.couldNotRemoveTheNewOfficialSiteSModel")
      );
      uiMessage.error(settingsStore.modelError);
    } finally {
      settingsStore.siteOfficialModelsSaving = false;
    }
  }

  async function refreshSiteOfficialModels(): Promise<void> {
    const api = context.api();
    if (
      !api ||
      settingsStore.siteOfficialModelsSaving ||
      settingsStore.siteOfficialModelsRefreshing
    )
      return;
    invalidateSiteOfficialQuota(settingsStore);
    settingsStore.siteOfficialModelsRefreshing = true;
    try {
      let catalogRefreshed = false;
      try {
        const settings = await api.models.refreshSiteOfficial();
        context.applyLoadedModelSettings(settings);
        catalogRefreshed = true;
      } catch (error: unknown) {
        uiMessage.error(
          errorMessage(
            error,
            t(
              "siteOfficialModelSettings.couldNotRefreshTheNewOfficialSiteSModels"
            )
          )
        );
      }
      // A catalog failure must not prevent querying the saved key's quota.
      // Wait for the catalog operation to release the Main process key lock.
      const configured = settingsStore.modelSettings?.models.some(
        (model) => isDeepWriteSiteOfficialModel(model) && model.hasApiKey
      );
      if (configured && (await queryQuota(api)) && catalogRefreshed) {
        uiMessage.success(
          t("siteOfficialModelSettings.theNewOfficialSiteSModelPageHasBeen")
        );
      }
    } finally {
      settingsStore.siteOfficialModelsRefreshing = false;
    }
  }

  async function setSiteOfficialModelEnabled(
    modelId: string,
    enabled: boolean
  ): Promise<void> {
    const api = context.api();
    if (
      !api ||
      settingsStore.siteOfficialModelsSaving ||
      settingsStore.siteOfficialModelsRefreshing
    )
      return;
    invalidateSiteOfficialQuota(settingsStore);
    settingsStore.siteOfficialQuota = null;
    settingsStore.siteOfficialModelsSaving = true;
    try {
      const settings = await api.models.setSiteOfficialModelEnabled(
        modelId,
        enabled
      );
      context.applyLoadedModelSettings(settings);
      await queryQuota(api);
      uiMessage.success(
        enabled
          ? t(
              "siteOfficialModelSettings.modelEnabledAndAddedToTheModelSelector"
            )
          : t(
              "siteOfficialModelSettings.modelDisabledAndHiddenFromTheModelSelector"
            )
      );
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(
          error,
          t("modelSettingsCoordinator.failedToUpdateModelStatus")
        )
      );
    } finally {
      settingsStore.siteOfficialModelsSaving = false;
    }
  }

  return {
    loadSiteOfficialModels,
    saveSiteOfficialToken,
    clearSiteOfficialToken,
    refreshSiteOfficialModels,
    setSiteOfficialModelEnabled
  };
}
