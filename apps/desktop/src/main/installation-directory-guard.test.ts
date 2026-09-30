import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertOutsideInstallationDirectory,
  overlapsInstallationDirectory
} from "./installation-directory-guard";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function layout() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "deepwrite-install-guard-"))
  );
  roots.push(root);
  const installation = join(root, "application");
  await mkdir(installation);
  return { root, installation };
}

describe("installation directory guard", () => {
  it("rejects the installation directory and every depth beneath it", async () => {
    const { installation } = await layout();
    const deep = join(installation, "a", "b", "c", "d", "e");
    await mkdir(deep, { recursive: true });

    for (const target of [
      installation,
      join(installation, "a"),
      join(installation, "a", "b", "c"),
      deep
    ]) {
      await expect(
        overlapsInstallationDirectory(target, installation)
      ).resolves.toBe(true);
    }
  });

  it("rejects a directory that contains the installation directory", async () => {
    const { root, installation } = await layout();
    await expect(
      overlapsInstallationDirectory(root, installation)
    ).resolves.toBe(true);
  });

  it("allows siblings whose names merely share the installation prefix", async () => {
    const { root, installation } = await layout();
    const sibling = join(root, "application-data");
    await mkdir(sibling);
    await expect(
      overlapsInstallationDirectory(sibling, installation)
    ).resolves.toBe(false);
  });

  it("follows symlinked parents into the installation directory", async () => {
    const { root, installation } = await layout();
    const link = join(root, "shortcut");
    await symlink(installation, link, "junction");
    await mkdir(join(installation, "books"));

    await expect(
      overlapsInstallationDirectory(join(link, "books"), installation)
    ).resolves.toBe(true);
  });

  it("still compares lexically when the target no longer exists", async () => {
    const { installation } = await layout();
    await expect(
      overlapsInstallationDirectory(
        join(installation, "removed", "books"),
        installation
      )
    ).resolves.toBe(true);
  });

  it("names the rule and the folder kind in the error", async () => {
    const { installation } = await layout();
    await expect(
      assertOutsideInstallationDirectory(
        join(installation, "x", "y"),
        installation,
        "工作目录"
      )
    ).rejects.toThrow(/工作目录不能.*任意层级子目录.*不能包含安装目录/u);
  });
});
