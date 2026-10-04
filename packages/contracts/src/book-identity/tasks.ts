import { z } from "zod";
import { BookSchema } from "../catalog";
import { LongBookSummarySchema } from "../long-workspace";
import { ChatAssistantProjectRefSchema } from "../chat-assistant-base";
import { ImageModelCapabilitySchema } from "../image-models/presets";
import {
  BookIdentityIdSchema,
  CoverAspectRatioSchema,
  CoverTitleRenderingSchema
} from "./limits";
import { BookIdentityAdoptedSchema } from "./record";
import {
  BookTitleCandidateSchema,
  BookSynopsisCandidateSchema,
  BookCoverCandidateSchema
} from "./candidates";
const base = z
  .object({
    jobId: z.string().trim().min(1).max(120),
    book: ChatAssistantProjectRefSchema,
    candidateCount: z.number().int().min(1),
    brief: z.string().trim().max(2000).optional(),
    seedCandidateIds: z.array(BookIdentityIdSchema).max(5).optional()
  })
  .strict();
export const BookTitleDesignTaskInputSchema = base.extend({
  candidateCount: z.number().int().min(1).max(20)
});
export const BookSynopsisDesignTaskInputSchema = base.extend({
  candidateCount: z.number().int().min(1).max(8)
});
export const BookCoverDesignTaskInputSchema = base
  .extend({
    candidateCount: z.number().int().min(1).max(6),
    imagesPerCandidate: z.number().int().min(1).max(4),
    aspectRatio: CoverAspectRatioSchema,
    titleRendering: CoverTitleRenderingSchema,
    autoRender: z.boolean().optional()
  })
  .refine(
    (input) => input.candidateCount * input.imagesPerCandidate <= 12,
    "单轮最多生成 12 张图。"
  );
export const BookIdentityDesignContextSchema = z
  .object({
    adopted: BookIdentityAdoptedSchema,
    recentTitles: z.array(z.string().max(120)).max(60),
    recentSynopsisHooks: z.array(z.string().max(240)).max(12),
    recentCoverConcepts: z.array(z.string().max(200)).max(18),
    seedCandidates: z
      .array(
        z.union([
          BookTitleCandidateSchema,
          BookSynopsisCandidateSchema,
          BookCoverCandidateSchema
        ])
      )
      .max(5)
  })
  .strict();
export type BookIdentityDesignContext = z.infer<
  typeof BookIdentityDesignContextSchema
>;
const resolved = {
  roundId: BookIdentityIdSchema,
  bookSnapshot: z.union([BookSchema, LongBookSummarySchema]),
  designContext: BookIdentityDesignContextSchema
};
const matchingBookSnapshot = (value: {
  book: { projectType: string; projectId: string };
  bookSnapshot: { bookType: string; id: string };
}) =>
  value.book.projectType === value.bookSnapshot.bookType &&
  value.book.projectId === value.bookSnapshot.id;
const snapshotMismatch = {
  path: ["bookSnapshot"],
  message: "作品快照必须与所选作品一致。"
};
export const BookTitleDesignResolvedInputSchema =
  BookTitleDesignTaskInputSchema.extend(resolved).refine(
    matchingBookSnapshot,
    snapshotMismatch
  );
export const BookSynopsisDesignResolvedInputSchema =
  BookSynopsisDesignTaskInputSchema.extend(resolved).refine(
    matchingBookSnapshot,
    snapshotMismatch
  );
export const BookCoverDesignResolvedInputSchema =
  BookCoverDesignTaskInputSchema.safeExtend({
    ...resolved,
    imageCapability: ImageModelCapabilitySchema,
    titleRenderingFallback: z.boolean().optional()
  }).refine(matchingBookSnapshot, snapshotMismatch);
export type BookIdentityTaskInput =
  | z.infer<typeof BookTitleDesignTaskInputSchema>
  | z.infer<typeof BookSynopsisDesignTaskInputSchema>
  | z.infer<typeof BookCoverDesignTaskInputSchema>;
