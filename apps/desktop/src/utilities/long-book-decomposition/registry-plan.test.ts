import { describe, expect, it } from "vitest";
import {
  decompositionRegistryPartNames,
  normalizeDecompositionRegistry,
  type DecompositionReadingCard
} from "@deepwrite/contracts";
import {
  planRegistryParts,
  registryMentionItems,
  type RegistryItem
} from "./registry-mentions";
import { expandRegistryPlan } from "./registry-plan";

const item = (
  ref: string,
  name: string,
  extra: Partial<RegistryItem> = {}
): RegistryItem => ({
  ref,
  domain: ref.startsWith("c") ? "character" : "term",
  name,
  aliases: [],
  firstChapterOrder: Number(ref.slice(1)),
  chunkCount: 1,
  mentionCount: 1,
  facts: [],
  ...(ref.startsWith("t") ? { categoryId: "items" } : {}),
  ...extra
});

const card = (
  order: number,
  names: Array<[string, string[]]>
): DecompositionReadingCard => ({
  chunkId: "chunk:1",
  chapters: [
    {
      chapterId: `chapter_${order}`,
      order,
      title: `第${order}章`,
      summary: "梗概。",
      events: [],
      characters: names.map(([name]) => name)
    }
  ],
  characters: names.map(([name, aliases]) => ({
    name,
    aliases,
    facts: [{ text: `${name}出场。`, chapterOrder: order }]
  })),
  world: [],
  plot: { events: [], foreshadowing: [] },
  style: { notes: [], excerpts: [] }
});

describe("registry plans", () => {
  it("builds every entry from the decisions and the evidence counts", () => {
    const items = [
      item("c1", "赵荣", { chunkCount: 20, aliases: ["小兄弟"] }),
      item("c2", "荣儿", { chunkCount: 3 }),
      item("c3", "小兄弟", { chunkCount: 1 }),
      item("c4", "众人"),
      item("t1", "铜铃")
    ];
    const { registry } = expandRegistryPlan(items, {
      groups: [{ refs: ["c2", "c1"], tier: "protagonist" }],
      ignored: ["c4"]
    });
    expect(registry.characters).toEqual([
      {
        id: "c1",
        name: "赵荣",
        // The card alias goes to the entry the name is the formal name of.
        aliases: ["荣儿"],
        tier: "protagonist",
        firstChapterOrder: 1,
        chunkCount: 23
      },
      {
        id: "c3",
        name: "小兄弟",
        aliases: [],
        tier: "passerby",
        firstChapterOrder: 3,
        chunkCount: 1
      },
      {
        id: "c4",
        name: "众人",
        aliases: [],
        ignored: true,
        tier: "passerby",
        firstChapterOrder: 4,
        chunkCount: 1
      }
    ]);
    expect(registry.terms).toEqual([
      {
        id: "t1",
        name: "铜铃",
        aliases: [],
        categoryId: "items",
        mentionCount: 1
      }
    ]);
    expect(() => normalizeDecompositionRegistry(registry, 1)).not.toThrow();
  });

  it("merges groups that chose the same formal name", () => {
    const { registry } = expandRegistryPlan(
      [item("c1", "阿铃"), item("c2", "铃铛"), item("c3", "铃儿")],
      {
        groups: [
          { refs: ["c1", "c2"], name: "铃铛" },
          { refs: ["c3"], name: "铃铛", tier: "major_supporting" }
        ],
        ignored: []
      }
    );
    expect(registry.characters).toMatchObject([
      {
        name: "铃铛",
        aliases: ["阿铃", "铃儿"],
        tier: "major_supporting"
      }
    ]);
  });

  it("rejects numbers it does not hold, repeats and mixed domains", () => {
    const items = [item("c1", "甲"), item("c2", "乙"), item("t1", "丙")];
    const expand =
      (groups: string[][], ignored: string[] = []) =>
      () =>
        expandRegistryPlan(items, {
          groups: groups.map((refs) => ({ refs })),
          ignored
        });
    expect(expand([["c1", "c9"]])).toThrow("没有这些编号：c9");
    expect(expand([["c1"]], ["c1"])).toThrow(
      "编号重复出现在多个组或忽略列表：c1"
    );
    expect(expand([["c1", "t1"]])).toThrow("同一组不能混合人物与设定");
  });

  it("keeps every spelling of one object in one part within the model budget", () => {
    const cards = Array.from({ length: 400 }, (_, index) =>
      card(index + 1, [
        [`人物${index}`, index % 50 ? [] : [`别号${index}`]],
        ...(index % 50
          ? []
          : ([[`别号${index}`, []]] as Array<[string, string[]]>))
      ])
    );
    const items = registryMentionItems(cards);
    const model = {
      contextWindow: 128_000,
      maxTokens: 4096,
      thinkingLevel: "high"
    };
    const parts = planRegistryParts(items, model);
    const limit = decompositionRegistryPartNames(model);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= limit)).toBe(true);
    expect(
      parts
        .flat()
        .map(({ ref }) => ref)
        .sort()
    ).toEqual(items.map(({ ref }) => ref).sort());
    for (let index = 0; index < 400; index += 50) {
      const part = (name: string) =>
        parts.findIndex((list) => list.some((entry) => entry.name === name));
      expect(part(`别号${index}`)).toBe(part(`人物${index}`));
    }
  });
});
