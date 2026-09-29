import type { WorkspaceDirectorySettings } from "@deepwrite/contracts";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../stores/settingsStore";
import { useWorkspaceDirectorySettings } from "./useWorkspaceDirectorySettings";
import type { WorkspaceFeatureHostApi } from "./workspaceFeatureHostTypes";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function harness(reset = async () => ({ path: "/default-books" })) {
  setActivePinia(createPinia());
  const settingsStore = useSettingsStore();
  settingsStore.markLoaded("workspaceDirectory", { path: "/custom-books" });
  const api: WorkspaceFeatureHostApi = {
    marketplace: {
      session: async () => ({
        authenticated: false,
        persistent: false,
        insecureTransport: false
      })
    },
    workspaceDirectory: {
      choose: vi.fn(async () => ({ path: "/chosen-books" })),
      list: vi.fn(async () => ({ path: "/custom-books" }))
    },
    storageSettings: { resetWorkspaceDirectory: vi.fn(reset) }
  };
  const notifications = { error: vi.fn(), success: vi.fn() };
  const directory = useWorkspaceDirectorySettings({
    api: () => api,
    settingsStore,
    notifications
  });
  return { api, settingsStore, notifications, directory };
}

describe("useWorkspaceDirectorySettings", () => {
  it("updates the existing shared settings store when restoring the default", async () => {
    const { directory, settingsStore, notifications } = harness();
    await directory.resetWorkspaceDirectory();

    expect(settingsStore.workspaceDirectoryPath).toBe("/default-books");
    expect(settingsStore.workspaceDirectorySettings).toEqual({
      path: "/default-books"
    });
    expect(settingsStore.workspaceDirectoryLoaded).toBe(true);
    expect(settingsStore.workspaceDirectoryLoading).toBe(false);
    expect(notifications.success).toHaveBeenCalledWith(
      "工作目录已恢复默认位置；现有项目保持原位置不变"
    );
  });

  it("shares a single in-flight guard for both directory entry points", async () => {
    const pending = deferred<{ path: string }>();
    const { directory, api, settingsStore } = harness(() => pending.promise);
    const resetting = directory.resetWorkspaceDirectory();
    await directory.chooseWorkspaceDirectory();
    await directory.resetWorkspaceDirectory();

    expect(api.storageSettings?.resetWorkspaceDirectory).toHaveBeenCalledOnce();
    expect(api.workspaceDirectory.choose).not.toHaveBeenCalled();
    expect(settingsStore.workspaceDirectoryLoading).toBe(true);
    pending.resolve({ path: "/default-books" });
    await resetting;
    await directory.chooseWorkspaceDirectory();
    expect(settingsStore.workspaceDirectoryPath).toBe("/chosen-books");
  });

  it("retains the current directory and reports a failure without blocking retries", async () => {
    const { directory, settingsStore, notifications } = harness(async () => {
      throw new Error("默认目录不可写");
    });
    await directory.resetWorkspaceDirectory();
    expect(settingsStore.workspaceDirectoryPath).toBe("/custom-books");
    expect(settingsStore.workspaceDirectoryLoading).toBe(false);
    expect(notifications.error).toHaveBeenCalledWith("默认目录不可写");
    await directory.chooseWorkspaceDirectory();
    expect(settingsStore.workspaceDirectoryPath).toBe("/chosen-books");
  });

  it("ignores late completion after the owning workspace is disposed", async () => {
    const pending = deferred<WorkspaceDirectorySettings>();
    const { directory, settingsStore, api, notifications } = harness();
    vi.mocked(api.storageSettings!.resetWorkspaceDirectory).mockImplementation(
      () => pending.promise
    );
    const resetting = directory.resetWorkspaceDirectory();
    directory.dispose();
    pending.resolve({ path: "/default-books" });
    await resetting;

    expect(settingsStore.workspaceDirectoryPath).toBe("/custom-books");
    expect(settingsStore.workspaceDirectoryLoading).toBe(false);
    expect(notifications.success).not.toHaveBeenCalled();
  });
});
