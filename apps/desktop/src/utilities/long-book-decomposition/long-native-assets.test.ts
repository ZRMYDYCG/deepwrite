import { describe, expect, it } from "vitest";
import {
  LONG_CHARACTER_ALIAS_LIMIT,
  LongCharacterSchema,
  normalizeDecompositionRegistry,
  type DecompositionReadingCard,
  type LongBookDecompositionJob,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import {
  applyDecompositionNativeAsset,
  type NativeAssetWriter
} from "./long-native-assets";
import { registryMentionItems } from "./registry-mentions";
import { expandRegistryPlan } from "./registry-plan";

const card = (order: number, aliases: string[]): DecompositionReadingCard => ({
  chunkId: `chunk:${order}`,
  chapters: [
    {
      chapterId: `chapter_${order}`,
      order,
      title: `第${order}章`,
      summary: "梗概。",
      events: [],
      characters: ["橘青登"]
    }
  ],
  characters: [
    {
      name: "橘青登",
      aliases,
      facts: [{ text: "橘青登出场。", chapterOrder: order }]
    }
  ],
  world: [],
  plot: { events: [], foreshadowing: [] },
  style: { notes: [], excerpts: [] }
});
const titles = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `称呼${from + i}`);

describe("长篇人物写入", () => {
  it("名册别名超过长篇上限时保留最常用的别名，人物仍能写入", async () => {
    const tooLong = "长".repeat(130);
    // 称呼1–70 只在第 1 章出现；称呼71–80 与超长别名在后 3 章反复出现。
    const late = [...titles(71, 80), tooLong, " 称呼1 ", "橘青登"];
    const items = registryMentionItems([
      card(1, titles(1, 70)),
      card(2, late),
      card(3, late),
      card(4, late)
    ]);
    const registry = normalizeDecompositionRegistry(
      expandRegistryPlan(items, {
        groups: [{ refs: ["c1"], tier: "protagonist" }],
        ignored: []
      }).registry,
      1
    );
    expect(registry.characters[0]!.aliases.length).toBeGreaterThan(
      LONG_CHARACTER_ALIAS_LIMIT
    );

    const objects: string[] = [];
    const writer: NativeAssetWriter = {
      file: async () => {},
      object: (id) => objects.push(id),
      remove: async () => {}
    };
    const index = {
      characters: [],
      characterFiles: [],
      plot: { chapterCards: [] }
    } as unknown as LongWorkspaceIndexSnapshot;
    await applyDecompositionNativeAsset(
      {
        id: "ldjob_aliases",
        source: { range: { start: 1 } }
      } as unknown as LongBookDecompositionJob,
      index,
      {
        kind: "character",
        registryId: "c1",
        summary: "概要",
        coreProfile: "核心档案",
        relationships: "关系",
        latestState: "最新状态",
        history: "经历"
      },
      registry,
      writer,
      "character:c1"
    );

    const [character] = index.characters;
    expect(character!.aliases).toEqual([...titles(71, 80), ...titles(1, 54)]);
    expect(() => LongCharacterSchema.parse(character)).not.toThrow();
    expect(objects).toEqual([character!.id]);
  });
});
