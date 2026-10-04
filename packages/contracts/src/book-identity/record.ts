import { z } from "zod";
import {
  BookIdentityIdSchema,
  CoverAspectRatioSchema,
  CoverTitleRenderingSchema
} from "./limits";
import {
  BookTitleCandidateSchema,
  BookSynopsisCandidateSchema,
  BookCoverCandidateSchema
} from "./candidates";

export const BookIdentityRequestSchema = z
  .object({
    candidateCount: z.number().int().min(1).max(20),
    brief: z.string().max(2000).optional(),
    seedCandidateIds: z.array(BookIdentityIdSchema).max(5).default([])
  })
  .strict();
export const BookIdentityCoverRequestSchema = BookIdentityRequestSchema.extend({
  candidateCount: z.number().int().min(1).max(6),
  imagesPerCandidate: z.number().int().min(1).max(4),
  aspectRatio: CoverAspectRatioSchema,
  titleRendering: CoverTitleRenderingSchema,
  autoRender: z.boolean().default(true)
}).refine(
  (value) => value.candidateCount * value.imagesPerCandidate <= 12,
  "单轮最多生成 12 张图。"
);
const roundBase = {
  id: BookIdentityIdSchema,
  source: z.enum(["agent", "manual"]),
  createdAt: z.string().datetime(),
  profile: z
    .object({ id: z.string().min(1).max(120), name: z.string().max(80) })
    .strict()
    .optional(),
  model: z
    .object({ id: z.string().min(1).max(120), label: z.string().max(120) })
    .strict()
    .optional()
};
export const BookIdentityTitleRoundSchema = z
  .object({
    ...roundBase,
    field: z.literal("title"),
    request: BookIdentityRequestSchema,
    candidates: z.array(BookTitleCandidateSchema).max(2000)
  })
  .strict();
export const BookIdentitySynopsisRoundSchema = z
  .object({
    ...roundBase,
    field: z.literal("synopsis"),
    request: BookIdentityRequestSchema,
    candidates: z.array(BookSynopsisCandidateSchema).max(1000)
  })
  .strict();
export const BookIdentityCoverRoundSchema = z
  .object({
    ...roundBase,
    field: z.literal("cover"),
    request: BookIdentityCoverRequestSchema,
    candidates: z.array(BookCoverCandidateSchema).max(6)
  })
  .strict();
export const BookIdentityRoundSchema = z.discriminatedUnion("field", [
  BookIdentityTitleRoundSchema,
  BookIdentitySynopsisRoundSchema,
  BookIdentityCoverRoundSchema
]);
export type BookIdentityRound = z.infer<typeof BookIdentityRoundSchema>;
export type BookIdentityCoverRound = z.infer<
  typeof BookIdentityCoverRoundSchema
>;
export const BookIdentityAdoptedSchema = z
  .object({
    title: z
      .object({
        candidateId: BookIdentityIdSchema,
        title: z.string().min(1).max(120),
        subtitle: z.string().max(200).optional(),
        adoptedAt: z.string().datetime()
      })
      .strict()
      .optional(),
    synopsis: z
      .object({
        candidateId: BookIdentityIdSchema,
        text: z.string().min(1).max(2000),
        hook: z.string().max(240).optional(),
        adoptedAt: z.string().datetime()
      })
      .strict()
      .optional(),
    cover: z
      .object({
        candidateId: BookIdentityIdSchema,
        imageId: BookIdentityIdSchema,
        file: z.literal("cover.png"),
        adoptedAt: z.string().datetime()
      })
      .strict()
      .optional()
  })
  .strict();
export const BookIdentityRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("deepwrite.book-identity"),
    bookId: z.string().min(1).max(512),
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    adopted: BookIdentityAdoptedSchema,
    rounds: z.array(BookIdentityRoundSchema).max(180),
    diagnostics: z
      .object({
        foreignBookId: z.string().max(512).optional(),
        corruptFile: z.string().max(240).optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .superRefine((record, context) => {
    const ids = record.rounds.map((round) => round.id);
    const candidateIds = record.rounds.flatMap((round) =>
      round.candidates.map((candidate) => candidate.id)
    );
    if (
      new Set(ids).size !== ids.length ||
      new Set(candidateIds).size !== candidateIds.length
    )
      context.addIssue({
        code: "custom",
        path: ["rounds"],
        message: "轮次和候选标识不能重复。"
      });
    for (const field of ["title", "synopsis", "cover"] as const)
      if (record.rounds.filter((round) => round.field === field).length > 60)
        context.addIssue({
          code: "custom",
          path: ["rounds"],
          message: "每个字段最多保留 60 轮。"
        });
  });
export type BookIdentityRecord = z.infer<typeof BookIdentityRecordSchema>;
export const BookIdentityRoundReceiptSchema = z
  .object({
    roundId: BookIdentityIdSchema,
    revision: z.number().int().positive()
  })
  .strict();
export type BookIdentityRoundReceipt = z.infer<
  typeof BookIdentityRoundReceiptSchema
>;
