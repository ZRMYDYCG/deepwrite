import { z } from "zod";
import { EnvelopeBaseSchema } from "../envelope";
import { DecompositionIdSchema } from "./limits";
export const DecompositionTargetUpdatedEventSchema = EnvelopeBaseSchema.extend({
  type: z.literal("decomposition.target_updated"),
  payload: z.object({
    jobId: DecompositionIdSchema,
    targetKind: z.enum(["long", "material-group"]),
    projectIds: z.array(DecompositionIdSchema).min(1).max(5),
    unitId: DecompositionIdSchema.optional()
  })
});
export type DecompositionTargetUpdatedEvent = z.infer<
  typeof DecompositionTargetUpdatedEventSchema
>;
