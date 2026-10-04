import type { DeepWriteApi } from "@deepwrite/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAppLanguage } from "../i18n";
import { useStorageSettings } from "./useStorageSettings";

afterEach(() => setAppLanguage("zh-CN", "zh-CN"));

type StorageApi = NonNullable<DeepWriteApi["storageSettings"]>;

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function snapshot(path = "/user-data") {
  return {
    userData: { path, defaultPath: "/default-data", isDefault: false },
    workspace: {
      path: "/default-books",
      defaultPath: "/default-books",
      isDefault: true
    }
  };
}

function harness(overrides: Partial<StorageApi> = {}) {
  const api: StorageApi = {
    get: vi.fn(async () => snapshot()),
    chooseUserData: vi.fn(async () => ({ restarting: false })),
    resetUserData: vi.fn(async () => ({ restarting: false })),
    resetWorkspaceDirectory: vi.fn(async () => ({ path: "/default-books" })),
    openDirectory: vi.fn(async () => undefined),
    ...overrides
  };
  const notifications = { error: vi.fn(), success: vi.fn() };
  const storage = useStorageSettings({ api: () => api, notifications });
  return { api, notifications, storage };
}

describe("useStorageSettings", () => {
  it("shows the native current and default paths and discards stale reads", async () => {
    const first = deferred<ReturnType<typeof snapshot>>();
    const second = deferred<ReturnType<typeof snapshot>>();
    const get = vi
      .fn<StorageApi["get"]>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { storage } = harness({ get });
    const olderLoad = storage.load();
    const newerLoad = storage.load();

    second.resolve(snapshot("/latest-data"));
    await newerLoad;
    first.resolve(snapshot("/stale-data"));
    await olderLoad;

    expect(storage.settings.value).toEqual(snapshot("/latest-data"));
    expect(storage.loading.value).toBe(false);
  });

  it("leaves paths intact on cancellation and prevents overlapping migrations", async () => {
    const pending = deferred<{ restarting: boolean }>();
    const chooseUserData = vi.fn(() => pending.promise);
    const { api, storage, notifications } = harness({ chooseUserData });
    await storage.load();

    const changing = storage.changeUserData();
    await storage.changeUserData(true);
    await storage.openDirectory("workspace");
    expect(chooseUserData).toHaveBeenCalledOnce();
    expect(api.resetUserData).not.toHaveBeenCalled();
    expect(api.openDirectory).not.toHaveBeenCalled();
    pending.resolve({ restarting: false });
    await changing;

    expect(storage.settings.value).toEqual(snapshot());
    expect(storage.migrating.value).toBe(false);
    expect(notifications.success).not.toHaveBeenCalled();
    await storage.changeUserData(true);
    expect(api.resetUserData).toHaveBeenCalledOnce();
  });

  it("keeps operations disabled once a confirmed restart is pending", async () => {
    const { api, storage, notifications } = harness({
      resetUserData: vi.fn(async () => ({ restarting: true }))
    });
    await storage.load();
    await storage.changeUserData(true);
    await storage.changeUserData();
    await storage.load();

    expect(storage.restarting.value).toBe(true);
    expect(api.get).toHaveBeenCalledOnce();
    expect(api.chooseUserData).not.toHaveBeenCalled();
    expect(notifications.success).toHaveBeenCalledOnce();
  });

  it("reports read, migration, and folder errors through notifications and allows retry", async () => {
    const get = vi
      .fn<StorageApi["get"]>()
      .mockRejectedValueOnce(new Error("读取失败"))
      .mockResolvedValue(snapshot());
    const { storage, notifications } = harness({
      get,
      chooseUserData: vi.fn(async () => {
        throw new Error("迁移失败");
      }),
      openDirectory: vi.fn(async () => {
        throw new Error("目录不可访问");
      })
    });
    await storage.load();
    expect(storage.loading.value).toBe(false);
    await storage.load();
    await storage.changeUserData();
    expect(storage.migrating.value).toBe(false);
    await storage.openDirectory("user-data");

    expect(notifications.error.mock.calls).toEqual([
      ["读取失败"],
      ["迁移失败"],
      ["目录不可访问"]
    ]);
  });

  it("explains rejected IPC payloads by code and keeps unknown diagnostics", async () => {
    const chooseUserData = vi
      .fn<StorageApi["chooseUserData"]>()
      .mockRejectedValueOnce({
        code: "storage_settings.target_not_empty",
        message: "所选位置中的 DeepWriteData 文件夹已有文件"
      })
      .mockRejectedValueOnce({
        code: "storage_settings.overlaps_installation",
        message: "diagnostic"
      })
      .mockRejectedValueOnce({
        code: "storage_settings.operation_failed",
        message: "EPERM: operation not permitted, rename"
      });
    const { storage, notifications } = harness({ chooseUserData });
    await storage.load();
    await storage.changeUserData();
    setAppLanguage("en-US", "zh-CN");
    await storage.changeUserData();
    setAppLanguage("zh-CN", "zh-CN");
    await storage.changeUserData();

    expect(notifications.error.mock.calls).toEqual([
      [
        "所选位置中的 DeepWriteData 文件夹已有文件。为避免覆盖，请选择其他位置。"
      ],
      [
        "The user data folder cannot be inside the application installation folder or contain it. Choose another folder."
      ],
      ["更改用户数据目录失败：EPERM: operation not permitted, rename"]
    ]);
  });

  it("does not update unmounted panels or surface their late failures", async () => {
    const pending = deferred<ReturnType<typeof snapshot>>();
    const { storage, notifications } = harness({ get: () => pending.promise });
    const reading = storage.load();
    storage.dispose();
    pending.reject(new Error("迟到的读取错误"));
    await reading;

    expect(storage.settings.value).toBeNull();
    expect(notifications.error).not.toHaveBeenCalled();
  });
});
