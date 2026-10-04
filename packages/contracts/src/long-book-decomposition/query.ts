import { z } from "zod";
import {
  DECOMPOSITION_BRIEF_MAX_CHARACTERS,
  DecompositionIdSchema,
  DecompositionRangeSchema
} from "./limits";
export const DecompositionQuerySchema = z
  .object({
    kind: z.enum([
      "status",
      "brief",
      "chunkText",
      "searchSource",
      "cards",
      "cardDigest",
      "mentions",
      "characterMentions",
      "worldMentions",
      "styleNotes",
      "samplePassages",
      "assets",
      "registry"
    ]),
    unitId: DecompositionIdSchema.optional(),
    /** `brief`: the units of one child task, assembled into one pack. */
    unitIds: z.array(DecompositionIdSchema).min(1).max(20).optional(),
    chunkId: DecompositionIdSchema.optional(),
    registryId: DecompositionIdSchema.optional(),
    categoryId: DecompositionIdSchema.optional(),
    range: DecompositionRangeSchema.optional(),
    query: z.string().trim().min(1).max(200).optional(),
    strategy: z
      .enum(["opening", "climax", "dialogue", "ending", "random"])
      .optional(),
    cursor: z.number().int().nonnegative().optional()
  })
  .strict()
  .refine(
    ({ kind, unitIds }) => kind !== "brief" || Boolean(unitIds?.length),
    "证据包需要指定单元。"
  );
export type DecompositionQuery = z.infer<typeof DecompositionQuerySchema>;
/** Lookups page at 12,000 characters; an evidence pack comes whole. */
export const DecompositionQueryResultSchema = z.object({
  content: z.string().max(DECOMPOSITION_BRIEF_MAX_CHARACTERS),
  nextCursor: z.number().int().nonnegative().nullable(),
  totalCharacters: z.number().int().nonnegative()
});
export type DecompositionQueryResult = z.infer<
  typeof DecompositionQueryResultSchema
>;
