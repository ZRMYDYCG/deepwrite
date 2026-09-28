import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEnvelope as envelope,
  CommandEnvelopeSchema,
  ShortBookAnalysisSourceSchema,
  ShortBookAnalysisCatalogSchema,
  type CommandEnvelope
} from "@deepwrite/contracts";
import { withShortBookAnalysisSources } from "../../../utilities/short-book-analysis-sources";
import {
  handleShortBookSourceCommands,
  type ShortBookSourceCommandContext
} from "./short-book-source-commands";
function createEnvelope<T, K extends string>(type: K, payload: T) {
  return envelope(type, payload, {
    id: "test-command",
    correlationId: "test-command"
  });
}
const roots: string[] = [];
async function setup() {
  const path = await mkdtemp(join(tmpdir(), "short-analysis-"));
  roots.push(path);
  const core = withShortBookAnalysisSources(async (command) => ({
    status: "rejected",
    requestId: command.id,
    error: { code: "unused", message: "unused" }
  }));
  const dialog = { showOpenDialog: vi.fn() };
  const ctx = {
    dialog,
    getMainWindow: () => undefined,
    getWorkspaceDirectory: async () => path,
    core
  } as unknown as ShortBookSourceCommandContext;
  return { path, core, ctx, dialog };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});
describe("short analysis source import and Core snapshots", () => {
  it("deletes only the requested snapshot and keeps original files and other sources", async () => {
    const { path, ctx, dialog } = await setup();
    const original = join(path, "story.md");
    await writeFile(original, "完整正文");
    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [original]
    });
    const imported = await handleShortBookSourceCommands(
      ctx,
      createEnvelope("shortBookAnalysis.chooseSources", {})
    );
    if (imported?.status !== "accepted") throw new Error("Import failed");
    const [source] = imported.payload as { id: string }[];
    await handleShortBookSourceCommands(
      ctx,
      createEnvelope("shortBookAnalysis.addText", {
        title: "保留",
        text: "另一篇正文"
      })
    );
    const deletion = createEnvelope("shortBookAnalysis.deleteSource", {
      sourceId: source!.id
    });
    const deleted = await handleShortBookSourceCommands(ctx, deletion);
    expect(deleted?.status === "accepted" && deleted.payload).toBe(source!.id);
    expect((await handleShortBookSourceCommands(ctx, deletion))?.status).toBe(
      "accepted"
    );
    expect(await readFile(original, "utf8")).toBe("完整正文");
    await expect(
      readFile(join(path, "short-book-analysis-sources", `${source!.id}.json`))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const catalog = await handleShortBookSourceCommands(
      ctx,
      createEnvelope("shortBookAnalysis.listSources", {})
    );
    if (catalog?.status !== "accepted") throw new Error("List failed");
    expect(
      ShortBookAnalysisCatalogSchema.parse(catalog.payload).sources.map(
        (book) => book.title
      )
    ).toEqual(["保留"]);
    expect(
      (
        await handleShortBookSourceCommands(
          ctx,
          createEnvelope("shortBookAnalysis.loadSource", {
            sourceId: source!.id
          })
        )
      )?.status
    ).toBe("rejected");
  });
  it("rejects direct internal deletion and invalid source identifiers", async () => {
    const { ctx, path, core } = await setup();
    expect(
      (
        await handleShortBookSourceCommands(
          ctx,
          createEnvelope("shortBookAnalysis.deleteStoredSource", {
            workspaceDirectory: path,
            sourceId: "book-1"
          })
        )
      )?.status
    ).toBe("rejected");
    for (const sourceId of ["../outside", "/outside", "", "book/1"]) {
      expect(
        CommandEnvelopeSchema.safeParse(
          createEnvelope("shortBookAnalysis.deleteSource", { sourceId })
        ).success
      ).toBe(false);
      expect(
        (
          await core(
            createEnvelope("shortBookAnalysis.deleteStoredSource", {
              workspaceDirectory: path,
              sourceId
            })
          )
        ).status
      ).toBe("rejected");
    }
  });
  it("imports whole TXT and Markdown, retains headings and never changes originals", async () => {
    const { path, ctx, dialog } = await setup();
    const txt = join(path, "story.txt");
    const md = join(path, "other.md");
    const body = "第一章 来信\n正文\n第二章 告别\n完整结局";
    await writeFile(txt, body);
    await writeFile(md, "# 标题\n另一篇正文");
    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [txt, md]
    });
    const imported = await handleShortBookSourceCommands(
      ctx,
      createEnvelope("shortBookAnalysis.chooseSources", {})
    );
    expect(imported?.status).toBe("accepted");
    const sources =
      imported?.status === "accepted" ? imported.payload : undefined;
    expect(Array.isArray(sources) && sources.length).toBe(2);
    const first = ShortBookAnalysisSourceSchema.parse(
      (sources as unknown[])[0]
    );
    expect(first.text).toBe(body);
    expect(await readFile(txt, "utf8")).toBe(body);
    const loaded = await handleShortBookSourceCommands(
      ctx,
      createEnvelope("shortBookAnalysis.loadSource", { sourceId: first.id })
    );
    expect(loaded?.status === "accepted" && loaded.payload).toEqual(first);
  });
  it("persists pasted text and does not cap historical sources at ten", async () => {
    const { ctx } = await setup();
    for (let i = 0; i < 11; i++)
      expect(
        (
          await handleShortBookSourceCommands(
            ctx,
            createEnvelope("shortBookAnalysis.addText", {
              title: `故事${i}`,
              text: "完整正文"
            })
          )
        )?.status
      ).toBe("accepted");
    const result = await handleShortBookSourceCommands(
      ctx,
      createEnvelope("shortBookAnalysis.listSources", {})
    );
    expect(
      result?.status === "accepted" &&
        ShortBookAnalysisCatalogSchema.parse(result.payload).sources.length
    ).toBe(11);
  });
  it("cancels without saving and rejects blank bodies and direct internal commands", async () => {
    const { ctx, dialog, path } = await setup();
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const canceled = await handleShortBookSourceCommands(
      ctx,
      createEnvelope("shortBookAnalysis.chooseSources", {})
    );
    expect(canceled?.status === "accepted" && canceled.payload).toBeNull();
    expect(
      (
        await handleShortBookSourceCommands(
          ctx,
          createEnvelope("shortBookAnalysis.addText", {
            title: "空白",
            text: "  "
          })
        )
      )?.status
    ).toBe("rejected");
    expect(
      (
        await handleShortBookSourceCommands(
          ctx,
          createEnvelope("shortBookAnalysis.querySources", {
            workspaceDirectory: path
          })
        )
      )?.status
    ).toBe("rejected");
  });
  it("rejects source directory symlinks", async () => {
    const { path, core } = await setup();
    const external = await mkdtemp(join(tmpdir(), "short-external-"));
    roots.push(external);
    await symlink(external, join(path, "short-book-analysis-sources"));
    expect(
      (
        await core(
          createEnvelope("shortBookAnalysis.querySources", {
            workspaceDirectory: path
          }) as CommandEnvelope
        )
      ).status
    ).toBe("rejected");
  });
});
