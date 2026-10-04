import { describe, expect, it } from "vitest";
import {
  normalizeDecompositionRegistry,
  type DecompositionAsset,
  type DecompositionReadingCard,
  type DecompositionRecord,
  type LongBookDecompositionJob
} from "@deepwrite/contracts";
import { buildDecompositionBrief, type BriefContext } from "./briefs";
import { briefTokens } from "./brief-text";
import { queryDecomposition } from "./query";
import { decompositionFixture } from "./test-support";

const card = (
  order: number,
  facts: Array<[string, string]>
): DecompositionReadingCard => ({
  chunkId: "chunk:1",
  chapters: [
    {
      chapterId: `source_chapter_${order}`,
      order,
      title: `第 ${order} 章`,
      summary: `第 ${order} 章梗概。`,
      events: [],
      characters: [...new Set(facts.map(([name]) => name))]
    }
  ],
  characters: [...new Set(facts.map(([name]) => name))].map((name) => ({
    name,
    aliases: [],
    facts: facts
      .filter(([who]) => who === name)
      .map(([, text]) => ({ text, chapterOrder: order }))
  })),
  world: [],
  plot: { events: [], foreshadowing: [] },
  style: { notes: [], excerpts: [] }
});

function context(
  job: LongBookDecompositionJob,
  cards: DecompositionReadingCard[],
  assets: Record<string, DecompositionAsset> = {},
  records: Record<string, DecompositionRecord> = {}
): BriefContext {
  return {
    job,
    chapters: [],
    cards: async () => cards,
    registry: async () =>
      normalizeDecompositionRegistry(
        {
          characters: [
            {
              id: "rc_main",
              name: "主角",
              aliases: ["阿铃"],
              tier: "protagonist",
              firstChapterOrder: 1,
              chunkCount: 3
            }
          ],
          terms: []
        },
        1
      ),
    record: async (id) => records[id]!,
    asset: async (id) => assets[id],
    repairs: async (id) =>
      id === "character:rc_main" ? ["最新状态与第 3 章不符"] : []
  };
}

function unit(
  job: LongBookDecompositionJob,
  id: string,
  dependencies: string[] = []
) {
  job.units[id] = {
    phase: "integrate",
    status: "running",
    attempts: 0,
    inputRevision: "revision",
    dependencies,
    outputRefs: [],
    receiptIds: [],
    updatedAt: new Date().toISOString()
  };
}

describe("decomposition evidence packs", () => {
  it("hands a reader its unsaved chapters with their checkpoint ids", async () => {
    const { job, root, service } = await decompositionFixture("materials", 3);
    const pack = async () =>
      (
        await queryDecomposition(job, root, service.reader, {
          kind: "brief",
          unitIds: ["chunk:1"]
        })
      ).content;
    expect(await pack()).toContain(
      "### reading:source_chapter_2｜chapterId=source_chapter_2｜order=2"
    );
    expect(await pack()).toContain("主角在第 2 章继续寻找铜铃。");
    job.units["reading:source_chapter_2"]!.status = "done";
    const resumed = await pack();
    expect(resumed).toContain("已保存，无需再交：reading:source_chapter_2");
    expect(resumed).not.toContain("主角在第 2 章继续寻找铜铃。");
  });

  it("builds a final dossier from saved biographies and recent mentions", async () => {
    const { job } = await decompositionFixture("materials", 3);
    unit(job, "character-volume:rc_main:1");
    unit(job, "character:rc_main", ["character-volume:rc_main:1"]);
    const pack = await buildDecompositionBrief(
      context(job, [card(3, [["阿铃", "敲响铜铃。"]])], {
        "character-volume:rc_main:1": {
          kind: "character-volume",
          registryId: "rc_main",
          volume: "第 1 卷",
          startOrder: 1,
          endOrder: 3,
          content: "第一卷小传：主角离乡。"
        }
      }),
      ["character:rc_main"],
      50_000
    );
    expect(pack).toContain("【已保存的分卷小传 character-volume:rc_main:1】");
    expect(pack).toContain("第一卷小传：主角离乡。");
    expect(pack).toContain("第3章：敲响铜铃。");
    expect(pack).toContain("最新状态与第 3 章不符");
  });

  it("samples oversized evidence evenly within the budget", async () => {
    const { job } = await decompositionFixture("materials", 3);
    unit(job, "character:rc_main");
    const cards = Array.from({ length: 400 }, (_, index) =>
      card(index + 1, [
        ["主角", `第 ${index + 1} 次出手，记录细节。`.repeat(4)]
      ])
    );
    const pack = await buildDecompositionBrief(
      context(job, cards),
      ["character:rc_main"],
      6000
    );
    expect(briefTokens(pack)).toBeLessThanOrEqual(6600);
    expect(pack).toContain("已按章节均匀保留");
    expect(pack).toMatch(/第3\d\d章：/u);
  });

  it("gives the registry merge every saved part", async () => {
    const { job } = await decompositionFixture("materials", 3);
    unit(job, "registry:part:1");
    unit(job, "registry:merge", ["registry:part:1"]);
    const pack = await buildDecompositionBrief(
      context(
        job,
        [],
        {},
        {
          "registry:part:1": {
            unitId: "registry:part:1",
            data: {
              kind: "registry",
              registry: {
                characters: [
                  {
                    id: "rc_part",
                    name: "铃铛客",
                    aliases: [],
                    tier: "minor_supporting",
                    firstChapterOrder: 2,
                    chunkCount: 1
                  }
                ],
                terms: []
              }
            }
          }
        }
      ),
      ["registry:merge"],
      50_000
    );
    expect(pack).toContain('"name":"铃铛客"');
  });
});
