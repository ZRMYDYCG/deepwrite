import { z } from "zod";
import {
  LONG_BOOK_ANALYSIS_MAX_PROMPT_CHARACTERS,
  LongBookAnalysisIdSchema,
  LongBookAnalysisLibraryIdSchema
} from "./long-book-analysis-limits";
import {
  MaterialKindSchema,
  MaterialStageIdSchema,
  SkillKindSchema,
  SkillStageIdSchema
} from "./catalog";
export const LongBookAnalysisOutputSchema = z.discriminatedUnion("domain", [
  z.object({
    domain: z.literal("material"),
    kind: MaterialKindSchema,
    stageId: MaterialStageIdSchema,
    libraryId: LongBookAnalysisLibraryIdSchema.optional()
  }),
  z.object({
    domain: z.literal("skill"),
    kind: SkillKindSchema,
    stageId: SkillStageIdSchema,
    libraryId: LongBookAnalysisLibraryIdSchema.optional()
  })
]);
export type LongBookAnalysisOutput = z.infer<
  typeof LongBookAnalysisOutputSchema
>;

export const LongBookAnalysisPresetSchema = z.object({
  id: LongBookAnalysisIdSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  systemPrompt: z
    .string()
    .trim()
    .min(1)
    .max(LONG_BOOK_ANALYSIS_MAX_PROMPT_CHARACTERS),
  output: LongBookAnalysisOutputSchema,
  builtin: z.boolean().optional()
});
export type LongBookAnalysisPreset = z.infer<
  typeof LongBookAnalysisPresetSchema
>;
