import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import { computed, ref } from "vue";
import type { DeepWriteApi } from "@deepwrite/contracts";
import { isDeepWriteSiteOfficialModel } from "@deepwrite/contracts/renderer";
import type { useSettingsStore } from "../stores/settingsStore";
import { beginSiteOfficialQuotaRequest } from "./siteOfficialQuotaRequests";

const t = createScopedTranslator("workspace.siteOfficialQuotaMerge");

interface QuotaMergeContext {
  api(): DeepWriteApi | undefined;
  settingsStore: ReturnType<typeof useSettingsStore>;
  notifications: {
    warning(message: string): void;
    error(message: string): void;
    success(message: string): void;
  };
}

export function useSiteOfficialQuotaMerge(context: QuotaMergeContext) {
  const { settingsStore: store, notifications } = context;
  const open = ref(false);
  const sourceKey = ref("");
  const pending = ref(false);
  let targetRevision = "";
  const disabledReason = computed(() => {
    if (store.siteOfficialModelsSaving || store.siteOfficialModelsRefreshing) {
      return t("waitForTheCurrentOperationToFinish");
    }
    if (
      !store.modelSettings?.models.some(
        (model) => isDeepWriteSiteOfficialModel(model) && model.hasApiKey
      )
    ) {
      return t("addTheCurrentKeyFirst");
    }
    if (store.siteOfficialQuota?.unlimited)
      return t("unlimitedKeysDoNotNeedAdditionalQuota");
    if (!store.siteOfficialQuota?.targetRevision)
      return t("refreshTheCurrentKeySQuotaFirst");
    return "";
  });

  function show(): void {
    if (disabledReason.value || pending.value) return;
    targetRevision = store.siteOfficialQuota!.targetRevision!;
    sourceKey.value = "";
    open.value = true;
  }

  function close(): void {
    if (pending.value) return;
    sourceKey.value = "";
    targetRevision = "";
    open.value = false;
  }

  async function submit(): Promise<void> {
    if (pending.value || !open.value) return;
    const source = sourceKey.value.trim();
    if (!source || source.length > 1_024) {
      notifications.warning(t("enterAValidSourceKey"));
      return;
    }
    if (
      disabledReason.value ||
      store.siteOfficialQuota?.targetRevision !== targetRevision
    ) {
      notifications.warning(
        disabledReason.value ||
          t("theCurrentKeyConfigurationChangedRefreshTheQuotaAnd")
      );
      close();
      return;
    }
    const api = context.api();
    if (!api) {
      notifications.error(
        t("theDesktopServiceIsTemporarilyUnavailablePleaseTryAgain")
      );
      return;
    }
    pending.value = true;
    store.siteOfficialModelsSaving = true;
    const current = beginSiteOfficialQuotaRequest(store);
    try {
      const result = await api.models.mergeSiteOfficialQuota({
        sourceKey: source,
        targetRevision
      });
      sourceKey.value = "";
      open.value = false;
      targetRevision = "";
      if (current()) store.siteOfficialQuota = result.quota;
      notifications.success(
        t("transferredTheSourceKeyHasBeenPermanentlyDeactivated", {
          transferred: result.transferred
        })
      );
      try {
        const quota = await api.models.querySiteOfficialQuota();
        if (current()) store.siteOfficialQuota = quota;
      } catch {
        // The merge result already contains the authoritative post-merge quota.
        notifications.warning(
          t("quotaTransferredUsageHasNotRefreshedYetRefreshThe")
        );
      }
    } catch (error: unknown) {
      notifications.error(
        formatError(error, t("quotaTransferFailedRefreshTheQuotaToCheckThe"))
      );
    } finally {
      sourceKey.value = "";
      pending.value = false;
      store.siteOfficialModelsSaving = false;
    }
  }

  return { open, sourceKey, pending, disabledReason, show, close, submit };
}
