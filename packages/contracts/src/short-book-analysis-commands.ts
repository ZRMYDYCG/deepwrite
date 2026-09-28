import { z } from "zod";
import { EnvelopeBaseSchema } from "./envelope";
import {
  ShortBookAnalysisSourcesSchema,
  ShortBookAnalysisTextInputSchema
} from "./short-book-analysis";
const Id = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9_-]+$/iu);
export const ShortBookAnalysisCommandSchemas = [
  EnvelopeBaseSchema.extend({
    type: z.literal("shortBookAnalysis.chooseSources"),
    payload: z.object({})
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("shortBookAnalysis.addText"),
    payload: ShortBookAnalysisTextInputSchema
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("shortBookAnalysis.listSources"),
    payload: z.object({})
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("shortBookAnalysis.loadSource"),
    payload: z.object({ sourceId: Id })
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("shortBookAnalysis.deleteSource"),
    payload: z.object({ sourceId: Id })
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("shortBookAnalysis.storeSources"),
    payload: z.object({
      workspaceDirectory: z.string().min(1),
      sources: ShortBookAnalysisSourcesSchema.min(1)
    })
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("shortBookAnalysis.deleteStoredSource"),
    payload: z.object({
      workspaceDirectory: z.string().min(1),
      sourceId: Id
    })
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("shortBookAnalysis.querySources"),
    payload: z.object({
      workspaceDirectory: z.string().min(1),
      sourceId: Id.optional()
    })
  })
] as const;
