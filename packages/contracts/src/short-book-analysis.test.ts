import { describe, it, expect } from "vitest";
import {
  ShortBookAnalysisPresetSchema,
  ShortBookAnalysisRuntimeContextSchema
} from "./short-book-analysis";
import { ExtrasAgentSettingsInputSchema } from "./extras-agent";
import { assertShortAnalysisBudget } from "./short-book-analysis-budget";
const book = {
  id: "book-1",
  title: "测试短篇",
  text: "第一章 来信\n正文\n第二章 结局\n结束",
  kind: "paste" as const,
  importedAt: "2026-01-01T00:00:00.000Z"
};
const preset = ShortBookAnalysisPresetSchema.parse({
  id: "preset",
  name: "测试预设",
  description: "测试",
  systemPrompt: "分析全文",
  selectionMode: "multiple",
  output: { domain: "material", kind: "plot", stageId: "pacing" }
});
const context = (count: number) => ({
  jobId: "job",
  books: Array.from({ length: count }, (_, i) => ({ ...book, id: `book-${i}` }))
});
describe("short analysis contracts and budget", () => {
  it("keeps chapter-like headings in one body and accepts 1 to 10 books", () => {
    for (const count of [1, 10]) {
      const parsed = ShortBookAnalysisRuntimeContextSchema.parse(
        context(count)
      );
      expect(parsed.books).toHaveLength(count);
      expect(parsed.books[0]?.text).toBe(book.text);
    }
    for (const count of [0, 11])
      expect(
        ShortBookAnalysisRuntimeContextSchema.safeParse(context(count)).success
      ).toBe(false);
  });
  it("rejects duplicate books, duplicate presets and incompatible modes", () => {
    expect(
      ShortBookAnalysisRuntimeContextSchema.safeParse({
        ...context(1),
        books: [book, book]
      }).success
    ).toBe(false);
    expect(
      ExtrasAgentSettingsInputSchema.safeParse({
        agentId: "short-book-analysis",
        profiles: [preset, preset]
      }).success
    ).toBe(false);
    expect(
      ShortBookAnalysisPresetSchema.safeParse({
        ...preset,
        selectionMode: "batch"
      }).success
    ).toBe(false);
  });
  it("enforces single selection and accounts for prompt and output budget", () => {
    expect(() =>
      assertShortAnalysisBudget(
        context(2),
        { ...preset, selectionMode: "single" },
        { contextWindow: 32000, maxTokens: 4000 }
      )
    ).toThrow("一本");
    expect(() =>
      assertShortAnalysisBudget(context(10), preset, {
        contextWindow: 32000,
        maxTokens: 4000
      })
    ).not.toThrow();
    expect(() =>
      assertShortAnalysisBudget(
        context(1),
        { ...preset, systemPrompt: "文".repeat(20000) },
        { contextWindow: 32000, maxTokens: 4000 }
      )
    ).toThrow("上下文");
    expect(() =>
      assertShortAnalysisBudget(context(1), preset, {
        contextWindow: 32000,
        maxTokens: 32000
      })
    ).toThrow("上下文");
  });
});
