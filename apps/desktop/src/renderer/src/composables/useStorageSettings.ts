import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import { ref } from "vue";
import type { DeepWriteApi } from "@deepwrite/contracts";

const t = createScopedTranslator("workspace.storageSettings");

type StorageApi = NonNullable<DeepWriteApi["storageSettings"]>;
type StorageSettings = Awaited<ReturnType<StorageApi["get"]>>;
type DirectoryKind = Parameters<StorageApi["openDirectory"]>[0];

interface StorageSettingsContext {
  api(): StorageApi | undefined;
  notifications: {
    error(message: string): unknown;
    success(message: string): unknown;
  };
}

export function useStorageSettings(context: StorageSettingsContext) {
  const settings = ref<StorageSettings | null>(null);
  const loading = ref(false);
  const migrating = ref(false);
  const restarting = ref(false);
  let disposed = false;
  let loadGeneration = 0;

  function showError(error: unknown, fallback: string): void {
    if (!disposed) {
      context.notifications.error(formatError(error, fallback));
    }
  }

  async function load(): Promise<void> {
    const api = context.api();
    if (!api || disposed || migrating.value || restarting.value) return;
    const generation = ++loadGeneration;
    loading.value = true;
    try {
      const result = await api.get();
      if (!disposed && generation === loadGeneration) settings.value = result;
    } catch (error) {
      if (generation === loadGeneration) {
        showError(error, t("failedToReadStorageSettingsPleaseTryAgain"));
      }
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  }

  async function changeUserData(reset = false): Promise<void> {
    const api = context.api();
    if (
      !api ||
      disposed ||
      !settings.value ||
      loading.value ||
      migrating.value ||
      restarting.value
    ) {
      return;
    }
    migrating.value = true;
    try {
      const result = await (reset ? api.resetUserData() : api.chooseUserData());
      if (disposed) return;
      restarting.value = result.restarting;
      if (result.restarting) {
        context.notifications.success(
          t("dataMigrationIsReadyTheAppWillRestart")
        );
      }
    } catch (error) {
      showError(error, t("failedToChangeTheUserDataDirectoryPleaseTry"));
    } finally {
      migrating.value = false;
    }
  }

  async function openDirectory(kind: DirectoryKind): Promise<void> {
    const api = context.api();
    if (!api || disposed || migrating.value || restarting.value) return;
    try {
      await api.openDirectory(kind);
    } catch (error) {
      showError(error, t("failedToOpenDirectoryPleaseTryAgain"));
    }
  }

  function dispose(): void {
    disposed = true;
    loadGeneration += 1;
  }

  return {
    settings,
    loading,
    migrating,
    restarting,
    load,
    changeUserData,
    openDirectory,
    dispose
  };
}
