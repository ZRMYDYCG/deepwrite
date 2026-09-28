export * from "./short-book-analysis-presets";
import { z } from "zod";
import { LongBookAnalysisResultSchema } from "./long-book-analysis";

export const SHORT_BOOK_ANALYSIS_MAX_BOOKS = 10;
export const SHORT_BOOK_ANALYSIS_MAX_TEXT = 2_000_000;
export const SHORT_BOOK_ANALYSIS_MAX_FILE_BYTES = 25 * 1024 * 1024;
const Id = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9_-]+$/iu);
export const ShortBookAnalysisTextInputSchema = z.object({
  title: z.string().trim().min(1).max(256),
  text: z.string().trim().min(1).max(SHORT_BOOK_ANALYSIS_MAX_TEXT)
});
export const ShortBookAnalysisSourceSchema =
  ShortBookAnalysisTextInputSchema.extend({
    id: Id,
    kind: z.enum(["file", "paste"]),
    importedAt: z.string().datetime()
  });
export const ShortBookAnalysisSourceSummarySchema =
  ShortBookAnalysisSourceSchema.omit({ text: true }).extend({
    characterCount: z.number().int().positive()
  });
export const ShortBookAnalysisSourcesSchema = z
  .array(ShortBookAnalysisSourceSchema)
  .max(10);
export const ShortBookAnalysisCatalogSchema = z.object({
  sources: z.array(ShortBookAnalysisSourceSummarySchema)
});
export const ShortBookAnalysisRuntimeContextSchema = z
  .object({
    jobId: Id,
    books: ShortBookAnalysisSourcesSchema.min(1)
  })
  .superRefine((value, ctx) => {
    if (new Set(value.books.map((b) => b.id)).size !== value.books.length)
      ctx.addIssue({
        code: "custom",
        path: ["books"],
        message: "不能重复选择同一本书。"
      });
  });
export const ShortBookAnalysisResultSchema = LongBookAnalysisResultSchema;
export type ShortBookAnalysisSource = z.infer<
  typeof ShortBookAnalysisSourceSchema
>;
export type ShortBookAnalysisSourceSummary = z.infer<
  typeof ShortBookAnalysisSourceSummarySchema
>;
export type ShortBookAnalysisTextInput = z.infer<
  typeof ShortBookAnalysisTextInputSchema
>;
export type ShortBookAnalysisRuntimeContext = z.infer<
  typeof ShortBookAnalysisRuntimeContextSchema
>;
export type ShortBookAnalysisResult = z.infer<
  typeof ShortBookAnalysisResultSchema
>;
export interface ShortBookAnalysisApi {
  chooseSources(): Promise<ShortBookAnalysisSource[] | null>;
  addText(input: ShortBookAnalysisTextInput): Promise<ShortBookAnalysisSource>;
  sources: {
    list(): Promise<z.infer<typeof ShortBookAnalysisCatalogSchema>>;
    load(sourceId: string): Promise<ShortBookAnalysisSource>;
    delete(sourceId: string): Promise<ShortBookAnalysisSource["id"]>;
  };
}
