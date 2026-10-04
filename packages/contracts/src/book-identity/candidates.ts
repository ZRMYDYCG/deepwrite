import { z } from "zod";
import { BookIdentityIdSchema } from "./limits";
import { ImagePresetIdSchema } from "../image-models/presets";

const shortText = z.string().trim().max(2000);
export const BookTitleCandidateInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    subtitle: z.string().trim().max(200).optional(),
    angle: z.string().trim().max(120),
    rationale: shortText,
    keywords: z.array(z.string().trim().min(1).max(80)).max(12)
  })
  .strict();
export const BookSynopsisCandidateInputSchema = z
  .object({
    hook: z.string().trim().max(240).optional(),
    text: shortText.min(1),
    angle: z.string().trim().max(120),
    rationale: shortText
  })
  .strict();
export const BookCoverCandidateInputSchema = z
  .object({
    concept: z.string().trim().min(1).max(200),
    scene: shortText.min(1),
    composition: shortText.min(1),
    palette: z
      .array(z.string().regex(/^#[a-fA-F0-9]{6}$/))
      .min(1)
      .max(8),
    artStyle: z.string().trim().min(1).max(500),
    typography: z.string().trim().max(1000),
    titlePlacement: z.enum(["top", "bottom", "right", "center"]),
    prompt: z.string().trim().min(1).max(8000),
    negativePrompt: z.string().trim().max(2000).optional(),
    rationale: shortText
  })
  .strict();
export const CoverLayoutSchema = z
  .object({
    template: z.enum([
      "top-center",
      "bottom-horizontal",
      "right-vertical",
      "center-overlay",
      "top-left",
      "top-right",
      "center-left",
      "center-right",
      "bottom-left",
      "bottom-right",
      "left-vertical"
    ]),
    title: z.string().max(120),
    subtitle: z.string().max(200).default(""),
    author: z.string().max(120).default(""),
    fontFamily: z.string().min(1).max(240),
    fontWeight: z.number().int().min(100).max(900).default(700),
    fontSize: z.number().min(1).max(1000).default(72),
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    stroke: z.boolean().default(false),
    shadow: z.boolean().default(false)
  })
  .strict();
export type CoverLayout = z.infer<typeof CoverLayoutSchema>;
export const CoverAssetFileSchema = z
  .string()
  .regex(/^covers\/[a-zA-Z0-9_-]+(?:\.thumb|\.composed)?\.(?:png|jpg|webp)$/);
export const CoverImageProfileSchema = z
  .object({
    id: BookIdentityIdSchema,
    presetId: ImagePresetIdSchema,
    model: z.string().min(1).max(160)
  })
  .strict();
export const CoverImageRefSchema = z
  .object({
    id: BookIdentityIdSchema,
    file: CoverAssetFileSchema,
    thumb: CoverAssetFileSchema,
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
    imageProfile: CoverImageProfileSchema,
    createdAt: z.string().datetime(),
    composed: z
      .object({
        file: CoverAssetFileSchema,
        layout: CoverLayoutSchema,
        updatedAt: z.string().datetime()
      })
      .strict()
      .optional()
  })
  .strict();
export type CoverImageRef = z.infer<typeof CoverImageRefSchema>;
const stored = {
  id: BookIdentityIdSchema,
  starred: z.boolean().default(false),
  edited: z.boolean().default(false)
};
export const BookTitleCandidateSchema =
  BookTitleCandidateInputSchema.extend(stored);
export const BookSynopsisCandidateSchema =
  BookSynopsisCandidateInputSchema.extend({
    ...stored,
    wordCount: z.number().int().nonnegative().max(2000)
  });
export const BookCoverCandidateSchema = BookCoverCandidateInputSchema.extend({
  ...stored,
  lastRenderError: z.string().max(1000).nullable().default(null),
  images: z.array(CoverImageRefSchema).max(240).default([])
});
export type BookTitleCandidate = z.infer<typeof BookTitleCandidateSchema>;
export type BookSynopsisCandidate = z.infer<typeof BookSynopsisCandidateSchema>;
export type BookCoverCandidate = z.infer<typeof BookCoverCandidateSchema>;
export type BookIdentityCandidate =
  BookTitleCandidate | BookSynopsisCandidate | BookCoverCandidate;
export type BookTitleCandidateInput = z.infer<
  typeof BookTitleCandidateInputSchema
>;
export type BookSynopsisCandidateInput = z.infer<
  typeof BookSynopsisCandidateInputSchema
>;
export type BookCoverCandidateInput = z.infer<
  typeof BookCoverCandidateInputSchema
>;

export type TitleCandidate = BookTitleCandidate;
export type SynopsisCandidate = BookSynopsisCandidate;
export type CoverCandidate = BookCoverCandidate;

export const BOOK_IDENTITY_CANDIDATE_JSON_SCHEMAS = {
  title: z.toJSONSchema(BookTitleCandidateInputSchema),
  synopsis: z.toJSONSchema(BookSynopsisCandidateInputSchema),
  cover: z.toJSONSchema(BookCoverCandidateInputSchema)
} as const;
