import { z } from "zod";
import {
  LongBookAnalysisSavedSourceIdSchema,
  LongBookAnalysisSourceKindSchema
} from "./long-book-analysis-sources";
import { EnvelopeBaseSchema } from "./envelope";
export const LongBookAnalysisChooseSourceCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("longBookAnalysis.chooseSource"),
    payload: z.object({ kind: LongBookAnalysisSourceKindSchema })
  });

export const LongBookAnalysisListSourcesCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("longBookAnalysis.listSources"),
    payload: z.object({})
  });

export const LongBookAnalysisLoadSourceCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("longBookAnalysis.loadSource"),
    payload: z.object({ sourceId: LongBookAnalysisSavedSourceIdSchema })
  });
