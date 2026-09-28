import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
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
});
