import { z } from "zod";
import {
  DecompositionBeatTypeSchema,
  DecompositionReadingCardSchema
} from "./cards";
import { DecompositionIdSchema, DecompositionTextSchema } from "./limits";
import { DecompositionRegistryDataSchema } from "./registry";

const chapterOrder = z.number().int().min(1).max(10_000);
export const DecompositionAssetSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("chronicle"),
      summary: DecompositionTextSchema,
      points: z
        .array(
          z.object({
            title: z.string().min(1).max(120),
            summary: DecompositionTextSchema,
            startOrder: chapterOrder,
            endOrder: chapterOrder
          })
        )
        .max(200)
    }),
    z.object({
      kind: z.literal("book-line"),
      content: DecompositionTextSchema,
      volumes: z
        .array(
          z.object({
            title: z.string().min(1).max(256),
            summary: DecompositionTextSchema
          })
        )
        .max(10_000),
      gimmick: DecompositionTextSchema
    }),
    z.object({
      kind: z.literal("foreshadowing"),
      lines: z
        .array(
          z.object({
            key: DecompositionIdSchema,
            title: z.string().min(1).max(120),
            coreQuestion: DecompositionTextSchema,
            hiddenTruth: DecompositionTextSchema.optional(),
            expectedReaderEffect: DecompositionTextSchema,
            beats: z
              .array(
                z.object({
                  type: DecompositionBeatTypeSchema,
                  chapterOrder,
                  note: DecompositionTextSchema
                })
              )
              .max(10_000)
          })
        )
        .max(1000)
    }),
    z.object({ kind: z.literal("opening"), content: DecompositionTextSchema }),
    z.object({
      kind: z.literal("character-volume"),
      registryId: DecompositionIdSchema,
      volume: z.string().min(1).max(256),
      startOrder: chapterOrder,
      endOrder: chapterOrder,
      content: DecompositionTextSchema
    }),
    z.object({
      kind: z.literal("character"),
      registryId: DecompositionIdSchema,
      summary: DecompositionTextSchema,
      coreProfile: DecompositionTextSchema,
      relationships: DecompositionTextSchema,
      latestState: DecompositionTextSchema,
      history: DecompositionTextSchema
    }),
    z.object({
      kind: z.literal("world"),
      categoryId: DecompositionIdSchema,
      overview: DecompositionTextSchema,
      items: z
        .array(
          z.object({
            title: z.string().min(1).max(120),
            content: DecompositionTextSchema
          })
        )
        .max(1000)
    }),
    z.object({
      kind: z.literal("style"),
      content: DecompositionTextSchema,
      excerpts: z
        .array(
          z.object({
            chapterOrder,
            text: z.string().min(1).max(300),
            comment: DecompositionTextSchema
          })
        )
        .max(100)
    }),
    z.object({
      kind: z.literal("continuity"),
      characterState: DecompositionTextSchema,
      handoff: DecompositionTextSchema,
      foreshadowingChanges: DecompositionTextSchema,
      worldReveals: DecompositionTextSchema.optional()
    }),
    z.object({
      kind: z.literal("topic"),
      domain: z.enum(["world", "character", "plot", "style"]),
      title: z.string().min(1).max(120),
      content: DecompositionTextSchema
    })
  ])
  .refine(
    (value) => JSON.stringify(value).length <= 200_000,
    "单个成品超过 200,000 字。"
  );
export type DecompositionAsset = z.infer<typeof DecompositionAssetSchema>;
export const DecompositionReviewSchema = z.object({
  domain: z.enum(["character", "world", "plot", "continuity", "style"]),
  issues: z
    .array(
      z.object({
        id: DecompositionIdSchema,
        unitId: DecompositionIdSchema.optional(),
        description: DecompositionTextSchema,
        chapterOrders: z.array(chapterOrder).max(100),
        suggestion: DecompositionTextSchema,
        resolution: z.enum(["repair", "reminder", "fixed"])
      })
    )
    .max(1000)
});
export type DecompositionReview = z.infer<typeof DecompositionReviewSchema>;
export const DecompositionSubmissionDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reading"),
    card: DecompositionReadingCardSchema
  }),
  z.object({ kind: z.literal("finish-card") }),
  z.object({
    kind: z.literal("registry"),
    registry: DecompositionRegistryDataSchema
  }),
  z.object({ kind: z.literal("asset"), asset: DecompositionAssetSchema }),
  z.object({ kind: z.literal("review"), review: DecompositionReviewSchema })
]);
export type DecompositionSubmissionData = z.infer<
  typeof DecompositionSubmissionDataSchema
>;

export const DecompositionSubmissionJsonSchema = z.toJSONSchema(
  DecompositionSubmissionDataSchema
);

/** PI result tools use equivalent enums for literals at every schema depth. */
function toolJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    override: ({ jsonSchema }) => {
      if ("const" in jsonSchema) {
        jsonSchema.enum = [jsonSchema.const];
        delete jsonSchema.const;
      }
    }
  });
}

/** Narrow role tools avoid carrying every asset schema in a small model window. */
export const DecompositionToolJsonSchemas = {
  reading: toolJsonSchema(
    z.object({
      kind: z.literal("reading"),
      card: DecompositionReadingCardSchema
    })
  ),
  "finish-card": toolJsonSchema(z.object({ kind: z.literal("finish-card") })),
  registry: toolJsonSchema(
    z.object({
      kind: z.literal("registry"),
      registry: DecompositionRegistryDataSchema
    })
  ),
  review: toolJsonSchema(
    z.object({ kind: z.literal("review"), review: DecompositionReviewSchema })
  ),
  ...Object.fromEntries(
    DecompositionAssetSchema.options.map((asset) => [
      asset.shape.kind.value,
      toolJsonSchema(z.object({ kind: z.literal("asset"), asset }))
    ])
  )
};
