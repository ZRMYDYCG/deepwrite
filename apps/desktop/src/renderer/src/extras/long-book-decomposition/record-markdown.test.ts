import { describe, expect, it } from "vitest";
import {
  DEFAULT_DECOMPOSITION_PROFILE,
  type DecompositionRecord
} from "@deepwrite/contracts/renderer";
import { decompositionRecordMarkdown } from "./record-markdown";

const reading: DecompositionRecord = {
  unitId: "reading:chapter_1",
  data: {
    kind: "reading",
    card: {
      chunkId: "chunk:1",
      chapters: [
        {
          chapterId: "chapter_1",
          order: 1,
          title: "第一章 铜铃",
          summary: "主角找到铜铃。",
          events: ["铜铃响起"],
          characters: ["主角"],
          hook: "铜铃再次响起"
        }
      ],
      characters: [
        {
          name: "主角",
          aliases: ["阿铃"],
          facts: [{ text: "拾得铜铃", chapterOrder: 1 }]
        }
      ],
      world: [],
      plot: { events: [], foreshadowing: [] },
      style: { notes: ["短句推进"], excerpts: [] }
    }
  }
};

describe("拆解单元记录的展示", () => {
  it("把通读记录排成可读的章节梗概与事实，不暴露机器字段", () => {
    const markdown = decompositionRecordMarkdown(
      [reading],
      DEFAULT_DECOMPOSITION_PROFILE
    );
    expect(markdown).toContain("## 第一章 铜铃");
    expect(markdown).toContain("主角找到铜铃。");
    expect(markdown).toContain("- 铜铃响起");
    expect(markdown).toContain("**主角**（阿铃）");
    expect(markdown).toContain("短句推进");
    expect(markdown).not.toMatch(/chapterId|chunk:1|reading:/u);
  });

  it("名册按类别名称展示，审校列出问题与处理方式", () => {
    const markdown = decompositionRecordMarkdown(
      [
        {
          unitId: "registry:merge",
          data: {
            kind: "registry",
            registry: {
              characters: [
                {
                  id: "hero",
                  name: "主角",
                  aliases: [],
                  tier: "protagonist",
                  firstChapterOrder: 1,
                  chunkCount: 1
                }
              ],
              terms: [
                {
                  id: "bell",
                  categoryId: "items",
                  name: "铜铃",
                  aliases: [],
                  mentionCount: 2
                }
              ]
            }
          }
        },
        {
          unitId: "review:plot",
          data: {
            kind: "review",
            review: {
              domain: "plot",
              issues: [
                {
                  id: "issue_1",
                  description: "主线断裂",
                  chapterOrders: [1],
                  suggestion: "补一句交代",
                  resolution: "repair"
                }
              ]
            }
          }
        }
      ],
      DEFAULT_DECOMPOSITION_PROFILE
    );
    expect(markdown).toContain("**铜铃** · 物品");
    expect(markdown).toContain("主线断裂");
    expect(markdown).toContain("补一句交代");
  });
});
