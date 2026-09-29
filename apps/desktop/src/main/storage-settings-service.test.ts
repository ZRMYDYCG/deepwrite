import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageSettingsService } from "./storage-settings-service";
import { StorageLocationStore } from "./storage-location-store";
import { WorkspaceDirectoryStore } from "./workspace-directory-store";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "deepwrite-storage-settings-"))
  );
  roots.push(root);
  const source = join(root, "default");
  const target = join(root, "target");
  const documents = join(root, "documents");
  const installation = join(root, "application");
  await Promise.all([
    mkdir(source),
    mkdir(target),
    mkdir(documents),
    mkdir(installation)
  ]);
  const locations = new StorageLocationStore(source);
  const workspace = new WorkspaceDirectoryStore(source);
  await workspace.initializeDefault(documents);
  const options = {
    locations,
    workspace: () => workspace,
    documentsPath: () => documents,
    installationDirectory: () => installation,
    chooseDirectory: vi.fn(async (): Promise<string | undefined> => target),
    confirmMigration: vi.fn(async () => true),
    openPath: vi.fn(async () => ""),
    busy: vi.fn(() => false),
    flushRenderer: vi.fn(async () => undefined),
    restart: vi.fn()
  };
  const service = new StorageSettingsService(options);
  return {
    root,
    source,
    target,
    documents,
    installation,
    workspace,
    options,
    service
  };
}

describe("storage settings service", () => {
  it("reports actual and default paths and opens only the requested configured directory", async () => {
    const { service, source, documents, options } = await fixture();
    const snapshot = await service.get();
    expect(snapshot.userData).toEqual({
      path: source,
      defaultPath: source,
      isDefault: true
    });
    expect(snapshot.workspace.path).toBe(join(documents, "DeepWriteBooks"));
    await service.openDirectory("workspace");
    expect(options.openPath).toHaveBeenCalledWith(snapshot.workspace.path);
  });

  it("resets the shared workspace setting without moving or deleting existing books", async () => {
    const { service, workspace, target, documents } = await fixture();
    await workspace.save(target);
    await writeFile(join(target, "book.md"), "existing manuscript");
    expect((await service.get()).workspace.isDefault).toBe(false);
    expect(await service.resetWorkspaceDirectory()).toEqual({
      path: join(documents, "DeepWriteBooks")
    });
    expect((await workspace.list()).path).toBe(
      join(documents, "DeepWriteBooks")
    );
    expect(await readFile(join(target, "book.md"), "utf8")).toBe(
      "existing manuscript"
    );
  });

  it("flushes saved data before scheduling migration, keeping the active location until restart", async () => {
    const { service, source, target, options } = await fixture();
    options.flushRenderer.mockImplementation(async () => {
      expect(options.locations.pending).toBeUndefined();
    });
    expect(await service.chooseUserData()).toEqual({ restarting: true });
    expect(options.confirmMigration).toHaveBeenCalledWith(
      source,
      target,
      false
    );
    expect(options.locations.currentPath).toBe(source);
    expect(options.locations.pending).toMatchObject({
      sourcePath: source,
      targetPath: target
    });
    expect(options.restart).toHaveBeenCalledOnce();
    await expect(service.chooseUserData()).rejects.toThrow("等待");
    service.cancelRestart();
    expect(options.locations.pending).toBeUndefined();
    expect(service.restartPending).toBe(false);
  });

  it("does not schedule a migration when saving fails or the user cancels", async () => {
    const { service, options } = await fixture();
    options.confirmMigration.mockResolvedValueOnce(false);
    expect(await service.chooseUserData()).toEqual({ restarting: false });
    options.flushRenderer.mockRejectedValueOnce(new Error("save failed"));
    await expect(service.chooseUserData()).rejects.toThrow("save failed");
    expect(options.locations.pending).toBeUndefined();
    expect(options.restart).not.toHaveBeenCalled();
  });

  it("rejects occupied targets, nested paths, and running agents before restarting", async () => {
    const { service, source, target, options } = await fixture();
    await writeFile(join(target, "keep.txt"), "existing data");
    await expect(service.chooseUserData()).rejects.toThrow("空文件夹");
    const nested = join(source, "nested");
    await mkdir(nested);
    options.chooseDirectory.mockResolvedValueOnce(nested);
    await expect(service.chooseUserData()).rejects.toThrow("互相包含");
    options.busy.mockReturnValueOnce(true);
    await expect(service.chooseUserData()).rejects.toThrow("等待");
    expect(options.restart).not.toHaveBeenCalled();
  });

  it("rejects the installation directory and its descendants before migration", async () => {
    const { service, installation, options } = await fixture();
    options.chooseDirectory.mockResolvedValueOnce(installation);
    await expect(service.chooseUserData()).rejects.toThrow("安装目录");
    const nested = join(installation, "data");
    await mkdir(nested);
    options.chooseDirectory.mockResolvedValueOnce(nested);
    await expect(service.chooseUserData()).rejects.toThrow("安装目录");
    expect(options.confirmMigration).not.toHaveBeenCalled();
    expect(options.locations.pending).toBeUndefined();
  });

  it("clears the migration intent when restart dispatch fails", async () => {
    const { service, options } = await fixture();
    options.restart.mockImplementation(() => {
      throw new Error("restart failed");
    });
    await expect(service.chooseUserData()).rejects.toThrow("restart failed");
    expect(options.locations.pending).toBeUndefined();
    expect(service.restartPending).toBe(false);
  });

  it("allows restoring an occupied default only with the backup confirmation", async () => {
    const { service, source, target, options } = await fixture();
    options.locations.schedule(target, false);
    options.locations.complete();
    await writeFile(join(source, "keep.txt"), "old default data");
    expect(await service.resetUserData()).toEqual({ restarting: true });
    expect(options.confirmMigration).toHaveBeenCalledWith(target, source, true);
    expect(options.locations.pending?.allowExistingTarget).toBe(true);
    expect(await readFile(join(source, "keep.txt"), "utf8")).toBe(
      "old default data"
    );
  });
});
