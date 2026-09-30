import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceDirectoryStore } from "./workspace-directory-store";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("WorkspaceDirectoryStore", () => {
  it("creates and selects DeepWriteBooks under documents for a first-time user", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "deepwrite-workspace-directory-default-")
    );
    temporaryRoots.push(root);
    const documents = join(root, "Documents");
    const userData = join(root, "user-data");

    const store = new WorkspaceDirectoryStore(userData);
    const initialized = await store.initializeDefault(documents);
    const defaultDirectory = join(documents, "DeepWriteBooks");
    expect((await stat(defaultDirectory)).isDirectory()).toBe(true);
    const canonicalDefault = await realpath(defaultDirectory);
    expect(initialized).toEqual({ path: canonicalDefault });

    const reloaded = new WorkspaceDirectoryStore(userData);
    await expect(reloaded.list()).resolves.toEqual({
      path: canonicalDefault
    });
  });

  it("keeps an existing workspace directory when initializing the default", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "deepwrite-workspace-directory-existing-")
    );
    temporaryRoots.push(root);
    const existing = join(root, "已有工作区");
    const documents = join(root, "Documents");
    await Promise.all([mkdir(existing), mkdir(documents)]);

    const store = new WorkspaceDirectoryStore(join(root, "user-data"));
    const canonicalExisting = await realpath(existing);
    await store.save(existing);

    await expect(store.initializeDefault(documents)).resolves.toEqual({
      path: canonicalExisting
    });
    await expect(store.list()).resolves.toEqual({ path: canonicalExisting });
    await expect(stat(join(documents, "DeepWriteBooks"))).rejects.toMatchObject(
      {
        code: "ENOENT"
      }
    );
  });

  it("reuses an existing DeepWriteBooks folder without changing its contents", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "deepwrite-workspace-directory-reuse-")
    );
    temporaryRoots.push(root);
    const documents = join(root, "Documents");
    const defaultDirectory = join(documents, "DeepWriteBooks");
    await mkdir(defaultDirectory, { recursive: true });
    const manuscript = join(defaultDirectory, "draft.md");
    await writeFile(manuscript, "existing manuscript", "utf8");

    const store = new WorkspaceDirectoryStore(join(root, "user-data"));
    await expect(store.initializeDefault(documents)).resolves.toEqual({
      path: await realpath(defaultDirectory)
    });
    expect(await readFile(manuscript, "utf8")).toBe("existing manuscript");
  });

  it("starts unset and persists freely switchable directories", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "deepwrite-workspace-directory-")
    );
    temporaryRoots.push(root);
    const first = join(root, "工作区一");
    const second = join(root, "工作区二");
    await Promise.all([mkdir(first), mkdir(second)]);

    const store = new WorkspaceDirectoryStore(join(root, "user-data"));
    await expect(store.list()).resolves.toEqual({ path: null });
    const canonicalFirst = await realpath(first);
    const canonicalSecond = await realpath(second);
    await expect(store.save(first)).resolves.toEqual({ path: canonicalFirst });
    await expect(store.save(second)).resolves.toEqual({
      path: canonicalSecond
    });

    const reloaded = new WorkspaceDirectoryStore(join(root, "user-data"));
    await expect(reloaded.list()).resolves.toEqual({ path: canonicalSecond });
  });

  it("rejects files as workspace directories", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "deepwrite-workspace-directory-file-")
    );
    temporaryRoots.push(root);
    const file = join(root, "not-a-folder.txt");
    await writeFile(file, "x", "utf8");

    await expect(
      new WorkspaceDirectoryStore(join(root, "user-data")).save(file)
    ).rejects.toThrow(/真实文件夹/u);
  });

  it("rejects installation folders without changing the saved workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-workspace-install-"));
    temporaryRoots.push(root);
    const userData = join(root, "user-data");
    const installation = join(root, "application");
    const safe = join(root, "books");
    const nested = join(installation, "books");
    const deeplyNested = join(installation, "a", "b", "c", "books");
    const viaLink = join(root, "shortcut");
    await Promise.all([
      mkdir(userData),
      mkdir(nested, { recursive: true }),
      mkdir(deeplyNested, { recursive: true }),
      mkdir(safe)
    ]);
    await symlink(installation, viaLink, "junction");
    const store = new WorkspaceDirectoryStore(userData, installation);
    await store.save(safe);
    await expect(store.save(installation)).rejects.toThrow("安装目录");
    await expect(store.save(nested)).rejects.toThrow("安装目录");
    await expect(store.save(deeplyNested)).rejects.toThrow("安装目录");
    await expect(store.save(join(viaLink, "a", "b"))).rejects.toThrow(
      "安装目录"
    );
    await expect(store.save(root)).rejects.toThrow("安装目录");
    expect((await store.list()).path).toBe(await realpath(safe));
  });

  it("stops using a saved workspace that now overlaps the installation directory", async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "deepwrite-workspace-saved-overlap-"))
    );
    temporaryRoots.push(root);
    const userData = join(root, "user-data");
    const installation = join(root, "application");
    const inside = join(installation, "a", "b", "books");
    const documents = join(root, "Documents");
    await Promise.all([
      mkdir(userData),
      mkdir(inside, { recursive: true }),
      mkdir(documents)
    ]);
    // Saved by an older version, before the installation rule existed.
    await new WorkspaceDirectoryStore(userData).save(inside);

    const store = new WorkspaceDirectoryStore(userData, installation);
    await expect(store.list()).resolves.toEqual({ path: null });
    await expect(store.rejectedPath()).resolves.toBe(inside);

    const initialized = await store.initializeDefault(documents);
    const fallback = await realpath(join(documents, "DeepWriteBooks"));
    expect(initialized).toEqual({ path: fallback });
    await expect(store.list()).resolves.toEqual({ path: fallback });
    await expect(store.rejectedPath()).resolves.toBeNull();
    expect((await stat(inside)).isDirectory()).toBe(true);
  });

  it("stops using a saved workspace once the application is installed inside it", async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "deepwrite-workspace-installed-inside-"))
    );
    temporaryRoots.push(root);
    const userData = join(root, "user-data");
    const workspace = join(root, "books");
    const installation = join(workspace, "tools", "DeepWrite");
    await Promise.all([
      mkdir(userData),
      mkdir(installation, { recursive: true })
    ]);
    await new WorkspaceDirectoryStore(userData).save(workspace);

    const store = new WorkspaceDirectoryStore(userData, installation);
    await expect(store.list()).resolves.toEqual({ path: null });
    await expect(store.rejectedPath()).resolves.toBe(workspace);
  });

  it("keeps a saved workspace that stays outside the installation directory", async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "deepwrite-workspace-saved-outside-"))
    );
    temporaryRoots.push(root);
    const userData = join(root, "user-data");
    const installation = join(root, "application");
    const workspace = join(root, "application-books");
    await Promise.all([mkdir(userData), mkdir(installation), mkdir(workspace)]);
    await new WorkspaceDirectoryStore(userData).save(workspace);

    const store = new WorkspaceDirectoryStore(userData, installation);
    await expect(store.list()).resolves.toEqual({ path: workspace });
    await expect(store.rejectedPath()).resolves.toBeNull();
  });
});
