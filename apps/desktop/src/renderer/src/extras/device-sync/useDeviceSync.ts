import { syncProgressText } from "./displayText";
import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  syncRequestSchema,
  type SyncRequest,
  type SyncResponse,
  type SyncStatus
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../../ui-feedback";

const t = createScopedTranslator("extras.deviceSync");

export function useDeviceSync(
  changed: () => Promise<void>,
  prepareSync: () => Promise<boolean>
) {
  const status = ref<SyncStatus | null>(null);
  const pending = ref(false);
  const initialLoading = ref(true);
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  let epoch = 0;
  const request = async (input: SyncRequest): Promise<SyncResponse> => {
    const started = epoch;
    const api = window.deepwrite?.deviceSync;
    if (!api) throw new Error(t("desktopSyncRequired"));
    // Clone nested reactive values before contextBridge copies the arguments.
    // Preload validation runs too late to remove proxies from this boundary.
    const parsed = syncRequestSchema.safeParse(input);
    if (!parsed.success) throw new Error(t("validConnectionRequired"));
    const result = await api.request(parsed.data);
    if (!disposed && started === epoch && result.kind === "status")
      status.value = result.status;
    return result;
  };
  const run = async (input: SyncRequest): Promise<SyncResponse | null> => {
    if (pending.value && input.operation !== "cancel") return null;
    // The first sync only previews the plan until explicitly confirmed.
    // It neither saves editor drafts nor reloads the local workspace.
    const previewOnly =
      input.operation === "sync" &&
      status.value?.firstSyncConfirmed === false &&
      !input.confirmFirst;
    const changesWorkspace =
      ["sync", "restore", "initialize"].includes(input.operation) &&
      !previewOnly;
    const mutation = input.operation !== "cancel";
    if (mutation) {
      epoch++;
      pending.value = true;
    }
    try {
      if (
        (changesWorkspace || input.operation === "preview-initialization") &&
        !(await prepareSync())
      ) {
        uiMessage.info(t("saveBeforeSync"));
        return null;
      }
      const response = await request(input);
      if (
        input.operation === "initialize" &&
        response.kind === "status" &&
        response.status.progress.phase === "complete"
      ) {
        const [{ useLongWorkspaceStore }, { useCatalogIndexStore }] =
          await Promise.all([
            import("../../stores/longWorkspaceStore"),
            import("../../stores/catalogIndexStore")
          ]);
        useLongWorkspaceStore().clear();
        useCatalogIndexStore().clear();
      }
      if (changesWorkspace) await changed();
      if (input.operation === "restore")
        uiMessage.success(t("restoredLocally"));
      if (
        ["sync", "initialize"].includes(input.operation) &&
        response.kind === "status"
      ) {
        if (response.status.progress.phase === "complete")
          uiMessage.success(syncProgressText(response.status.progress));
        else if (response.status.progress.phase === "partial")
          uiMessage.info(syncProgressText(response.status.progress));
      }
      return response;
    } catch (error) {
      uiMessage.error(formatError(error, t("syncIncompleteRetry")));
      return null;
    } finally {
      if (mutation) {
        epoch++;
        pending.value = false;
      }
      if (!disposed)
        void request({ operation: "status" }).catch(() => {
          /* Preserve the last known state after a failed refresh. */
        });
    }
  };
  async function loadInitialStatus(): Promise<void> {
    initialLoading.value = true;
    try {
      const result = await request({ operation: "status" });
      if (
        !disposed &&
        result.kind === "status" &&
        result.status.config?.spaceId
      )
        void run({ operation: "check" });
    } catch (error) {
      if (!disposed) uiMessage.error(formatError(error, t("readStatusFailed")));
    } finally {
      if (!disposed) initialLoading.value = false;
    }
  }
  onMounted(() => {
    void loadInitialStatus();
    timer = setInterval(() => {
      if (pending.value)
        void request({ operation: "status" }).catch(() => {
          /* The active request reports its own error. */
        });
    }, 1500);
  });
  onBeforeUnmount(() => {
    disposed = true;
    if (timer) clearInterval(timer);
  });
  return { status, pending, initialLoading, loadInitialStatus, run, request };
}
