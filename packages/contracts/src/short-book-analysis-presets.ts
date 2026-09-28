import { z } from "zod";
import { LongBookAnalysisPresetSchema } from "./long-book-analysis-presets";
export const ShortBookAnalysisPresetSchema =
  LongBookAnalysisPresetSchema.extend({
    selectionMode: z.enum(["single", "multiple"])
  });
export const ShortBookAnalysisProfileSchema =
  ShortBookAnalysisPresetSchema.omit({ builtin: true });

export type ShortBookAnalysisPreset = z.infer<
  typeof ShortBookAnalysisPresetSchema
>;

export type ShortBookAnalysisProfile = z.infer<
  typeof ShortBookAnalysisProfileSchema
>;
