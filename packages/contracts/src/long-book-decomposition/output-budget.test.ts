import { describe, expect, it } from "vitest";
import { DecompositionSubmissionDataSchema } from "./assets";
import { splitDecompositionChronicles } from "./chunking";
import {
  DECOMPOSITION_CALL_OUTPUT_CEILING,
  decompositionBatchLimit,
  decompositionCallOutputTokens,
  decompositionRegistryPartNames
} from "./output-budget";

const chunk = (index: number, chapters: number) => ({
  id: `chunk:${index}`,
  startOrder: index * chapters - chapters + 1,
  endOrder: index * chapters,
  chapterIds: Array.from(
    { length: chapters },
    (_, i) => `chapter_${index * chapters + i}`
  ),
  estimatedTokens: 1000
});

describe("decomposition output budget", () => {
  it("leaves reasoning its share of the configured response limit", () => {
    const model = (thinkingLevel: string, maxTokens?: number) => ({
      contextWindow: 200_000,
      ...(maxTokens ? { maxTokens } : {}),
      thinkingLevel
    });
    expect(decompositionCallOutputTokens(model("off", 8192))).toBe(7372);
    expect(decompositionCallOutputTokens(model("high", 8192))).toBe(3276);
    // Unknown custom levels reason like `high`; no limit means 4,096.
    expect(decompositionCallOutputTokens(model("deep-think", 8192))).toBe(3276);
    expect(decompositionCallOutputTokens(model("medium"))).toBe(2048);
    // A large configured limit is still capped, a tiny one still floored.
    expect(decompositionCallOutputTokens(model("off", 128_000))).toBe(
      DECOMPOSITION_CALL_OUTPUT_CEILING
    );
    expect(decompositionCallOutputTokens(model("max", 1000))).toBe(800);
  });

  it("sizes batches and registry parts by what one call can hold", () => {
    const small = { maxTokens: 4096, thinkingLevel: "high" };
    const large = { maxTokens: 128_000, thinkingLevel: "high" };
    expect(decompositionBatchLimit(small, "worldItem")).toBe(3);
    expect(decompositionBatchLimit(large, "worldItem")).toBe(34);
    expect(decompositionRegistryPartNames(small)).toBe(139);
    expect(decompositionRegistryPartNames(large)).toBe(600);
  });

  it("closes a chronicle segment once its chapters would not fit one call", () => {
    const chunks = Array.from({ length: 10 }, (_, i) => chunk(i + 1, 20));
    const wide = { contextWindow: 1_000_000, maxTokens: 128_000 };
    const narrow = { ...wide, maxTokens: 4096, thinkingLevel: "high" };
    // The evidence budget alone would put all 200 chapters in one segment.
    expect(splitDecompositionChronicles(chunks, wide)).toHaveLength(2);
    const segments = splitDecompositionChronicles(chunks, narrow);
    expect(segments).toHaveLength(10);
    expect(segments.every(({ chunkIds }) => chunkIds.length === 1)).toBe(true);
  });

  it("accepts a staged batch without the text fields of the final asset", () => {
    const batch = {
      kind: "asset-part",
      asset: {
        kind: "world",
        categoryId: "items",
        items: [{ title: "铜铃", content: "能召回亡魂。" }]
      }
    };
    expect(DecompositionSubmissionDataSchema.safeParse(batch).success).toBe(
      true
    );
    expect(
      DecompositionSubmissionDataSchema.safeParse({ ...batch, kind: "asset" })
        .success
    ).toBe(false);
  });
});
