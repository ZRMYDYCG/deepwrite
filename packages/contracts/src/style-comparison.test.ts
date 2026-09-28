import { describe, expect, it } from "vitest";
import {
  StyleComparisonInputSchema,
  StyleComparisonResultSchema,
  assertStyleComparisonBudget
} from "./style-comparison";

const styleComparison = {
  referenceText: "雨停了。街上很静。",
  comparisonText: "风停了。屋里没有声音。"
};
describe("文风比对契约", () => {
  it("rejects missing, blank and oversized samples", () => {
    expect(StyleComparisonInputSchema.safeParse(styleComparison).success).toBe(
      true
    );
    for (const referenceText of ["", "  ", "文".repeat(30_001)])
      expect(
        StyleComparisonInputSchema.safeParse({
          ...styleComparison,
          referenceText
        }).success
      ).toBe(false);
  });
  it("counts an empty method at its limit when estimating the budget", () => {
    const model = { contextWindow: 18_000, maxTokens: 1_000 };
    expect(() =>
      assertStyleComparisonBudget(
        styleComparison,
        { systemPrompt: "关注节奏" },
        model
      )
    ).not.toThrow();
    expect(() =>
      assertStyleComparisonBudget(styleComparison, { systemPrompt: "" }, model)
    ).toThrow("上下文");
  });
  it("requires an actual bounded score and nonempty findings", () => {
    const result = {
      score: 70,
      summary: "节奏相近。",
      dimensions: ["措辞", "节奏", "语气"].map((name) => ({
        name,
        score: 70,
        reason: "都采用简短陈述句。"
      })),
      similarities: ["短句。"],
      differences: ["意象不同。"]
    };
    expect(StyleComparisonResultSchema.safeParse(result).success).toBe(true);
    for (const score of [undefined, "70", -1, 101, 70.5])
      expect(
        StyleComparisonResultSchema.safeParse({ ...result, score }).success
      ).toBe(false);
  });
});
