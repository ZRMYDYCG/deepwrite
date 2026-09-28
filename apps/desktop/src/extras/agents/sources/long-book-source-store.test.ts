import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LongBookAnalysisSource } from "@deepwrite/contracts";
import {
  LONG_BOOK_ANALYSIS_SOURCE_DIRECTORY,
  LongBookAnalysisSourceStore
} from "./long-book-source-store";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "deepwrite-analysis-store-"));
  temporaryDirectories.push(path);
  return path;
}

function source(id: string, text: string): LongBookAnalysisSource {
  return {
    id,
    kind: "txt",
    name: "重复导入的长篇.txt",
    chapters: [
      {
        id: `${id}_chapter`,
        order: 1,
        title: "第一章",
        sourceName: "重复导入的长篇.txt",
        text,
        charCount: text.length
      }
    ],
    diagnostics: []
  };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("LongBookAnalysisSourceStore", () => {
  it("keeps every import as an independent workspace snapshot", async () => {
    const workspace = await temporaryDirectory();
    const store = new LongBookAnalysisSourceStore(workspace);

    await store.save(
      source("long_book_analysis_source_11111111", "第一份正文")
    );
    await store.save(
      source("long_book_analysis_source_22222222", "第二份正文")
    );

    const catalog = await store.list();
    expect(catalog.sources).toHaveLength(2);
    expect(catalog.sources.map((item) => item.name)).toEqual([
      "重复导入的长篇.txt",
      "重复导入的长篇.txt"
    ]);
    expect(await store.load("long_book_analysis_source_11111111")).toEqual(
      source("long_book_analysis_source_11111111", "第一份正文")
    );
    expect(store.directory).toBe(
      join(workspace, LONG_BOOK_ANALYSIS_SOURCE_DIRECTORY)
    );
  });

  it("skips damaged metadata and rejects unsafe source ids", async () => {
    const workspace = await temporaryDirectory();
    const store = new LongBookAnalysisSourceStore(workspace);
    const damaged = join(
      workspace,
      LONG_BOOK_ANALYSIS_SOURCE_DIRECTORY,
      "damaged_source"
    );
    await mkdir(damaged, { recursive: true });
    await writeFile(join(damaged, "metadata.json"), "not-json", "utf8");

    await expect(store.list()).resolves.toEqual({ sources: [] });
    await expect(store.load("../../outside")).rejects.toThrow();
  });
});
