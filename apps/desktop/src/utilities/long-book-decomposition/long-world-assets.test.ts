import { describe, expect, it } from "vitest";
import {
  DEFAULT_DECOMPOSITION_PROFILE,
  type LongBookDecompositionJob,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import { applyWorldCategory } from "./long-world-assets";
import type { NativeAssetWriter } from "./long-native-assets";

const category = (id: string, title: string, items = 0) => ({
  id,
  title,
  order: 1,
  format: "list" as const,
  contentAuthority: "files" as const,
  overview: { id: `${id}_overview`, path: `${id}.md`, updatedAt: "" },
  items: Array.from({ length: items }, (_, index) => ({
    id: `${id}_item_${index}`,
    title: "已有条目",
    order: index + 1,
    file: { id: `${id}_item_${index}_file`, path: "x.md", updatedAt: "" }
  }))
});
const fixture = (
  worldbuilding: ReturnType<typeof category>[],
  units: LongBookDecompositionJob["units"] = {}
) => {
  const files: string[] = [];
  const objects: string[] = [];
  const writer: NativeAssetWriter = {
    file: async (reference) => {
      files.push(reference.id);
    },
    object: (id) => objects.push(id)
  };
  return {
    job: {
      id: "ldjob_world",
      profile: DEFAULT_DECOMPOSITION_PROFILE,
      units
    } as unknown as LongBookDecompositionJob,
    index: { worldbuilding } as unknown as LongWorkspaceIndexSnapshot,
    writer,
    files,
    objects
  };
};
const content = {
  overview: "概览",
  items: [{ title: "条目", content: "正文" }]
};

describe("世界观类别写入", () => {
  it("复用新书自带的同名空类别，不再新建重复类别", async () => {
    const { job, index, writer, objects } = fixture([
      category("world_rules", "规则"),
      category("world_realms", "境界")
    ]);
    await applyWorldCategory(
      job,
      index,
      "world:realms",
      "realms",
      "境界",
      content,
      writer
    );
    expect(index.worldbuilding.map(({ title }) => title)).toEqual([
      "规则",
      "境界"
    ]);
    expect(objects).toEqual(["world_realms"]);
    const realms = index.worldbuilding[1]!;
    expect(realms.format === "list" && realms.items).toHaveLength(1);
  });

  it("同名类别已有条目或已被其他单元占用时新建类别", async () => {
    const claimed = fixture([category("world_items", "物品")], {
      "world:items": {
        outputRefs: [{ resourceId: "world_items" }]
      }
    } as unknown as LongBookDecompositionJob["units"]);
    await applyWorldCategory(
      claimed.job,
      claimed.index,
      "topic:a:1",
      "topic:a:1",
      "物品",
      content,
      claimed.writer
    );
    expect(claimed.index.worldbuilding).toHaveLength(2);
    const filled = fixture([category("world_items", "物品", 1)]);
    await applyWorldCategory(
      filled.job,
      filled.index,
      "world:items",
      "items",
      "物品",
      content,
      filled.writer
    );
    expect(filled.index.worldbuilding).toHaveLength(2);
  });

  it("重试时沿用本单元上次写入的类别", async () => {
    const { job, index, writer, objects } = fixture(
      [category("world_rules", "规则", 1)],
      {
        "world:rules": { outputRefs: [{ resourceId: "world_rules" }] }
      } as unknown as LongBookDecompositionJob["units"]
    );
    await applyWorldCategory(
      job,
      index,
      "world:rules",
      "rules",
      "规则",
      content,
      writer
    );
    expect(index.worldbuilding).toHaveLength(1);
    expect(objects).toEqual(["world_rules"]);
  });
});
