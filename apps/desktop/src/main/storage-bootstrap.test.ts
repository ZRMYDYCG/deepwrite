import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireStorageInstanceLock,
  initializeStorageLocation
} from "./storage-bootstrap";
import { StorageLocationStore } from "./storage-location-store";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-storage-bootstrap-"));
  roots.push(root);
  const defaultPath = join(root, "default");
  const target = join(root, "custom");
  await mkdir(defaultPath);
  await mkdir(target);
  const paths = { userData: defaultPath, sessionData: defaultPath };
  const app = {
    getPath: () => paths.userData,
    setPath: (name: "userData" | "sessionData", path: string) => {
      paths[name] = path;
    },
    requestSingleInstanceLock: vi.fn(() => true)
  };
  return { root, defaultPath, target, paths, app };
}

describe("storage bootstrap", () => {
  it("keeps the instance lock outside profiles before selecting the active profile", async () => {
    const { app, paths, defaultPath } = await fixture();
    app.requestSingleInstanceLock.mockImplementation(() => {
      expect(paths.userData).toContain(".default.storage-bootstrap");
      return true;
    });
    expect(acquireStorageInstanceLock(app)).toBe(true);
    expect(paths.userData).toBe(defaultPath);
  });

  it("uses the system default without creating a custom configuration", async () => {
    const { app, paths, defaultPath } = await fixture();
    const migrate = vi.fn();
    const { locations } = initializeStorageLocation(app, migrate);
    expect(paths).toEqual({ userData: defaultPath, sessionData: defaultPath });
    expect(locations.currentPath).toBe(defaultPath);
    expect(migrate).not.toHaveBeenCalled();
  });

  it("commits migration before pointing both Electron profiles at the new data", async () => {
    const { app, paths, defaultPath, target } = await fixture();
    new StorageLocationStore(defaultPath).schedule(target, false);
    const migrate = vi.fn(() => expect(paths.userData).toBe(defaultPath));
    const result = initializeStorageLocation(app, migrate);
    expect(migrate).toHaveBeenCalledOnce();
    expect(paths).toEqual({ userData: target, sessionData: target });
    expect(result.locations.pending).toBeUndefined();
    expect(new StorageLocationStore(defaultPath).currentPath).toBe(target);
    expect(
      JSON.parse(await readFile(result.locations.statePath, "utf8"))
    ).toEqual({ version: 1, currentPath: target });
  });

  it("retains the original profile and clears the plan after migration failure", async () => {
    const { app, paths, defaultPath, target } = await fixture();
    new StorageLocationStore(defaultPath).schedule(target, false);
    const result = initializeStorageLocation(app, () => {
      throw new Error("ENOSPC");
    });
    expect(result.migrationError).toContain("原有数据未删除");
    expect(paths.userData).toBe(defaultPath);
    expect(new StorageLocationStore(defaultPath).pending).toBeUndefined();
  });

  it("refuses unavailable custom data instead of creating an empty profile", async () => {
    const { app, defaultPath, target } = await fixture();
    const store = new StorageLocationStore(defaultPath);
    store.schedule(target, false);
    store.complete();
    await rm(target, { recursive: true });
    expect(() => initializeStorageLocation(app)).toThrow("用户数据目录不可用");
    expect(new StorageLocationStore(defaultPath).currentPath).toBe(target);
  });

  it("does not silently discard malformed bootstrap pointers", async () => {
    const { app, defaultPath } = await fixture();
    const store = new StorageLocationStore(defaultPath);
    await writeFile(store.statePath, '{"version":1,"currentPath":"relative"}');
    expect(() => initializeStorageLocation(app)).toThrow(
      "存储位置配置无法读取"
    );
  });
});
