import { z } from "zod";
import { EnvelopeBaseSchema } from "../envelope";
import { ChatAssistantProjectRefSchema } from "../chat-assistant-base";
import { BookIdentityFieldSchema, BookIdentityIdSchema } from "./limits";
import {
  BookTitleCandidateInputSchema,
  BookSynopsisCandidateInputSchema,
  BookCoverCandidateInputSchema,
  BookCoverCandidateSchema,
  CoverLayoutSchema,
  CoverImageProfileSchema,
  CoverAssetFileSchema
} from "./candidates";
import {
  BookIdentityRoundSchema,
  BookIdentityRecordSchema,
  BookIdentityCoverRoundSchema
} from "./record";

export const BookIdentityBookInputSchema = z
  .object({ book: ChatAssistantProjectRefSchema })
  .strict();
export const BookIdentityAddManualCandidateInputSchema = z.discriminatedUnion(
  "field",
  [
    BookIdentityBookInputSchema.extend({
      field: z.literal("title"),
      candidate: BookTitleCandidateInputSchema
    }),
    BookIdentityBookInputSchema.extend({
      field: z.literal("synopsis"),
      candidate: BookSynopsisCandidateInputSchema
    })
  ]
);
export type BookIdentityAddManualCandidateInput = z.infer<
  typeof BookIdentityAddManualCandidateInputSchema
>;
const target = BookIdentityBookInputSchema.extend({
  roundId: BookIdentityIdSchema,
  candidateId: BookIdentityIdSchema
});
export const BookIdentityCandidatePatchSchema = z
  .object({
    starred: z.boolean().optional(),
    title: z.string().trim().min(1).max(120).optional(),
    subtitle: z.string().trim().max(200).optional(),
    hook: z.string().trim().max(240).optional(),
    text: z.string().trim().min(1).max(2000).optional(),
    angle: z.string().trim().max(120).optional(),
    rationale: z.string().trim().max(2000).optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    prompt: z.string().trim().min(1).max(8000).optional(),
    negativePrompt: z.string().trim().max(2000).optional(),
    concept: z.string().trim().min(1).max(200).optional(),
    scene: z.string().trim().min(1).max(2000).optional(),
    composition: z.string().trim().min(1).max(2000).optional(),
    palette: z
      .array(z.string().regex(/^#[a-fA-F0-9]{6}$/))
      .min(1)
      .max(8)
      .optional(),
    artStyle: z.string().trim().min(1).max(500).optional(),
    typography: z.string().trim().max(1000).optional(),
    titlePlacement: z.enum(["top", "bottom", "right", "center"]).optional()
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "请提供要修改的候选字段。");
export const BookIdentityUpdateCandidateInputSchema = target.extend({
  patch: BookIdentityCandidatePatchSchema
});
export type BookIdentityUpdateCandidateInput = z.infer<
  typeof BookIdentityUpdateCandidateInputSchema
>;
export const BookIdentityAdoptInputSchema = target
  .extend({
    field: BookIdentityFieldSchema,
    imageId: BookIdentityIdSchema.optional()
  })
  .refine(
    (value) => value.field !== "cover" || !!value.imageId,
    "采用封面时必须指定图片。"
  );
export type BookIdentityAdoptInput = z.infer<
  typeof BookIdentityAdoptInputSchema
>;
export const BookIdentityClearAdoptionInputSchema =
  BookIdentityBookInputSchema.extend({ field: BookIdentityFieldSchema });
export const BookIdentityDeleteRoundInputSchema =
  BookIdentityBookInputSchema.extend({ roundId: BookIdentityIdSchema });
export const BookIdentityPruneRoundsInputSchema =
  BookIdentityClearAdoptionInputSchema;
export const BookIdentityRenderCoverInputSchema = target.extend({
  requestId: BookIdentityIdSchema
});
export type BookIdentityRenderCoverInput = z.infer<
  typeof BookIdentityRenderCoverInputSchema
>;
export const BookIdentityCancelRenderInputSchema = z
  .object({ requestId: BookIdentityIdSchema })
  .strict();
export const BookIdentityCancelRenderResultSchema = z
  .object({ cancelled: z.boolean() })
  .strict();
export const BookIdentitySaveComposedCoverInputSchema = target.extend({
  imageId: BookIdentityIdSchema,
  layout: CoverLayoutSchema,
  pngBase64: z
    .string()
    .min(1)
    .max(Math.ceil((25 * 1024 * 1024) / 3) * 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
});
export type BookIdentitySaveComposedCoverInput = z.infer<
  typeof BookIdentitySaveComposedCoverInputSchema
>;
export const BookIdentityExportCoverInputSchema =
  BookIdentityBookInputSchema.extend({
    size: z.enum(["original", "600x800", "1080x1440"]),
    roundId: BookIdentityIdSchema.optional(),
    candidateId: BookIdentityIdSchema.optional(),
    imageId: BookIdentityIdSchema.optional()
  }).refine(
    (value) =>
      [value.roundId, value.candidateId, value.imageId].filter(Boolean).length %
        3 ===
      0,
    "导出候选图片时必须一并指定轮次、候选和图片。"
  );
export type BookIdentityExportCoverInput = z.infer<
  typeof BookIdentityExportCoverInputSchema
>;
export const BookIdentityExportCoverResultSchema = z
  .object({ cancelled: z.boolean(), path: z.string().max(4096).optional() })
  .strict();
export const BookIdentitySubmitInputSchema = z.discriminatedUnion("field", [
  z
    .object({
      book: ChatAssistantProjectRefSchema,
      roundId: BookIdentityIdSchema,
      field: z.literal("title"),
      candidates: z.array(BookTitleCandidateInputSchema).min(1).max(20)
    })
    .strict(),
  z
    .object({
      book: ChatAssistantProjectRefSchema,
      roundId: BookIdentityIdSchema,
      field: z.literal("synopsis"),
      candidates: z.array(BookSynopsisCandidateInputSchema).min(1).max(8)
    })
    .strict(),
  z
    .object({
      book: ChatAssistantProjectRefSchema,
      roundId: BookIdentityIdSchema,
      field: z.literal("cover"),
      candidates: z.array(BookCoverCandidateInputSchema).min(1).max(6)
    })
    .strict()
]);
export type BookIdentitySubmitInput = z.infer<
  typeof BookIdentitySubmitInputSchema
>;
export const BookIdentityReadContextInputSchema =
  BookIdentityBookInputSchema.extend({
    seedCandidateIds: z.array(BookIdentityIdSchema).max(5).optional()
  });
export const BookIdentityAppendRoundInputSchema =
  BookIdentityBookInputSchema.extend({ round: BookIdentityRoundSchema });
export const BookIdentityReadCandidateInputSchema = target;
export const BookIdentityReadCandidateResultSchema = z
  .object({
    record: BookIdentityRecordSchema,
    round: BookIdentityCoverRoundSchema,
    candidate: BookCoverCandidateSchema
  })
  .strict();
export const BookIdentityWriteCoverAssetInputSchema = target.extend({
  imageId: BookIdentityIdSchema.optional(),
  image: z
    .object({
      fileBase64: z
        .string()
        .min(1)
        .max(Math.ceil((20 * 1024 * 1024) / 3) * 4),
      mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
      width: z.number().int().positive().max(4096),
      height: z.number().int().positive().max(4096),
      thumbBase64: z
        .string()
        .min(1)
        .max(4 * 1024 * 1024),
      imageProfile: CoverImageProfileSchema
    })
    .strict()
});
export type BookIdentityWriteCoverAssetInput = z.infer<
  typeof BookIdentityWriteCoverAssetInputSchema
>;
export const BookIdentityResolveCoverAssetInputSchema =
  BookIdentityBookInputSchema.extend({
    file: z.union([z.literal("cover.png"), CoverAssetFileSchema])
  });
export const BookIdentityResolveCoverAssetResultSchema = z
  .object({
    path: z.string().min(1).max(4096),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    byteSize: z
      .number()
      .int()
      .nonnegative()
      .max(25 * 1024 * 1024)
  })
  .strict();
const envelope = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  EnvelopeBaseSchema.extend({ type: z.literal(type), payload });
export const BookIdentityPublicCommandSchemas = [
  envelope("bookIdentity.get", BookIdentityBookInputSchema),
  envelope("bookIdentity.inheritBook", BookIdentityBookInputSchema),
  envelope(
    "bookIdentity.addManualCandidate",
    BookIdentityAddManualCandidateInputSchema
  ),
  envelope(
    "bookIdentity.updateCandidate",
    BookIdentityUpdateCandidateInputSchema
  ),
  envelope("bookIdentity.adopt", BookIdentityAdoptInputSchema),
  envelope("bookIdentity.clearAdoption", BookIdentityClearAdoptionInputSchema),
  envelope("bookIdentity.deleteRound", BookIdentityDeleteRoundInputSchema),
  envelope("bookIdentity.pruneRounds", BookIdentityPruneRoundsInputSchema),
  envelope("bookIdentity.renderCover", BookIdentityRenderCoverInputSchema),
  envelope("bookIdentity.cancelRender", BookIdentityCancelRenderInputSchema),
  envelope(
    "bookIdentity.saveComposedCover",
    BookIdentitySaveComposedCoverInputSchema
  ),
  envelope("bookIdentity.exportCover", BookIdentityExportCoverInputSchema)
] as const;
export const BookIdentityInternalCommandSchemas = [
  envelope("bookIdentity.submitRound", BookIdentitySubmitInputSchema),
  envelope("bookIdentity.readContext", BookIdentityReadContextInputSchema),
  envelope("bookIdentity.appendRound", BookIdentityAppendRoundInputSchema),
  envelope(
    "bookIdentity.writeCoverAsset",
    BookIdentityWriteCoverAssetInputSchema
  ),
  envelope(
    "bookIdentity.recordRenderError",
    target.extend({ error: z.string().max(1000).nullable() })
  ),
  envelope("bookIdentity.readCandidate", BookIdentityReadCandidateInputSchema),
  envelope(
    "bookIdentity.resolveCoverAsset",
    BookIdentityResolveCoverAssetInputSchema
  )
] as const;
export const BookIdentityCommandSchemas = [
  ...BookIdentityPublicCommandSchemas,
  ...BookIdentityInternalCommandSchemas
] as const;
export const BookIdentityUpdatedPayloadSchema = z
  .object({
    bookKey: z.string().min(1).max(600),
    revision: z.number().int().nonnegative()
  })
  .strict();
export const BookIdentityUpdatedEventEnvelopeSchema = envelope(
  "book_identity.updated",
  BookIdentityUpdatedPayloadSchema
);
export type BookIdentityUpdatedEventEnvelope = z.infer<
  typeof BookIdentityUpdatedEventEnvelopeSchema
>;
