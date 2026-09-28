import { z } from "zod";

export const STYLE_COMPARISON_TEXT_LIMIT = 30_000;
export const STYLE_COMPARISON_METHOD_LIMIT = 8_000;

export const StyleComparisonInputSchema = z.object({
  referenceText: z.string().trim().min(1).max(STYLE_COMPARISON_TEXT_LIMIT),
  comparisonText: z.string().trim().min(1).max(STYLE_COMPARISON_TEXT_LIMIT)
});
export type StyleComparisonInput = z.infer<typeof StyleComparisonInputSchema>;

export const StyleComparisonRuntimeContextSchema =
  StyleComparisonInputSchema.extend({
    jobId: z.string().trim().min(1).max(120)
  });
export type StyleComparisonRuntimeContext = z.infer<
  typeof StyleComparisonRuntimeContextSchema
>;

/**
 * Conservative estimate; the samples are never truncated to fit. An empty
 * method falls back to the default one, counted at the method limit.
 */
export function assertStyleComparisonBudget(
  input: StyleComparisonInput,
  profile: { systemPrompt: string },
  model: { contextWindow?: number | undefined; maxTokens?: number | undefined }
): void {
  const methodLength =
    profile.systemPrompt.length || STYLE_COMPARISON_METHOD_LIMIT;
  const estimatedTokens =
    (JSON.stringify(input).length + methodLength) * 2 + 2500;
  if (
    model.contextWindow &&
    estimatedTokens + (model.maxTokens ?? 4096) > model.contextWindow
  ) {
    throw new Error(
      "两份文本可能超出当前模型的上下文容量，请缩短文本或选择更大上下文的模型。"
    );
  }
}

export const StyleComparisonDimensionSchema = z.object({
  name: z.string().trim().min(1).max(40),
  score: z.number().int().min(0).max(100),
  reason: z.string().trim().min(1).max(600)
});
export type StyleComparisonDimension = z.infer<
  typeof StyleComparisonDimensionSchema
>;

export const StyleComparisonResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(800),
  dimensions: z.array(StyleComparisonDimensionSchema).min(3).max(6),
  similarities: z.array(z.string().trim().min(1).max(400)).min(1).max(3),
  differences: z.array(z.string().trim().min(1).max(400)).min(1).max(3)
});
export type StyleComparisonResult = z.infer<typeof StyleComparisonResultSchema>;
