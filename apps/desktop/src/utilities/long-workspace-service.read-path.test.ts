import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandEnvelopeSchema, createEnvelope } from "@deepwrite/contracts";
import { handleLongCoreCommand } from "./long-core-commands";
import { LongWorkspaceService } from "./long-workspace-service";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "deepwrite-read-path-"))
  );
  roots.push(root);
  const userDataPath = join(root, "data");
  const parent = join(root, "books");
  await mkdir(parent);
  const service = new LongWorkspaceService({ userDataPath });
  const created = await service.create(parent, {
    title: "读取链路测试",
    genre: "悬疑"
  });
  const input = {
    bookId: created.book.id,
    fileId: created.book.workspaceIndex.chapters[0]!.body.id,
    offset: 0,
    maxCharacters: 16 * 1024
  };
  return { service, root, userDataPath, parent, created, input };
}

describe("long document read path", () => {
  it("resolves registration without opening the whole book again or taking a registry lock", async () => {
    const { service, userDataPath, input } = await fixture();
    const opened = vi.spyOn(service.catalog, "open");
    await writeFile(
      join(userDataPath, "long-project-registry.lock"),
      JSON.stringify({
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
        nonce: "abcdef12"
      })
    );
    const command = CommandEnvelopeSchema.parse(
      createEnvelope("long.readDocument", input, { id: "long-read-path-test" })
    );
    await expect(
      handleLongCoreCommand(service, command)
    ).resolves.toMatchObject({
      status: "accepted",
      requestId: command.id,
      payload: { bookId: input.bookId, file: { id: input.fileId }, content: "" }
    });
    expect(opened).not.toHaveBeenCalled();
  });

  it("checks the book identity from the loaded project before reading its files", async () => {
    const { service, parent, input } = await fixture();
    const other = await service.create(parent, {
      title: "另一本测试作品",
      genre: "悬疑"
    });
    const directory = await service.catalog.resolveProjectDirectory(
      input.bookId
    );
    const manifestPath = join(directory, "deepwrite.json");
    const indexPath = join(directory, "long/index.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const index = JSON.parse(await readFile(indexPath, "utf8"));
    manifest.id = other.book.id;
    index.bookId = other.book.id;
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(indexPath, JSON.stringify(index));
    await expect(service.readDocument(input)).rejects.toThrow(
      "长篇项目标识与注册信息不一致"
    );
  });

  it("observes preceding registry writes and rejects reads after unregister", async () => {
    const { service, input } = await fixture();
    const removed = service.unregister({ bookId: input.bookId });
    const read = expect(service.readDocument(input)).rejects.toThrow(
      /未注册|移除/u
    );
    await Promise.all([removed, read]);
  });

  it("repairs a corrupt primary under the write lock before resolving its backup", async () => {
    const { service, input } = await fixture();
    await writeFile(service.catalog.registryPath, "invalid JSON");
    await expect(service.readDocument(input)).resolves.toMatchObject({
      content: ""
    });
    const registry = JSON.parse(
      await readFile(service.catalog.registryPath, "utf8")
    );
    expect(
      registry.projects.some(
        (entry: { bookId: string }) => entry.bookId === input.bookId
      )
    ).toBe(true);
  });
});
