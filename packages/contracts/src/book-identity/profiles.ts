import { z } from "zod";
import { CoverAspectRatioSchema, CoverTitleRenderingSchema } from "./limits";
const base = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  builtin: z.boolean().optional(),
  systemPrompt: z.string().trim().min(1).max(60000)
});
export const BookTitleDesignProfileSchema = base.extend({
  candidateCount: z.number().int().min(1).max(20).default(8),
  titleLength: z
    .object({
      min: z.number().int().min(1).max(60),
      max: z.number().int().min(1).max(60)
    })
    .strict()
    .refine((value) => value.min <= value.max, "书名长度范围不正确。")
    .default({ min: 2, max: 15 }),
  subtitle: z.enum(["never", "optional", "always"]).default("optional")
});
export const BookSynopsisDesignProfileSchema = base.extend({
  candidateCount: z.number().int().min(1).max(8).default(3),
  targetLength: z.number().int().min(30).max(1000).default(200),
  includeHook: z.boolean().default(true)
});
export const BookCoverDesignProfileSchema = base
  .extend({
    candidateCount: z.number().int().min(1).max(6).default(3),
    imagesPerCandidate: z.number().int().min(1).max(4).default(1),
    aspectRatio: CoverAspectRatioSchema.default("3:4"),
    titleRendering: CoverTitleRenderingSchema.default("model"),
    autoRender: z.boolean().default(true),
    styleHint: z.string().trim().max(200).default("")
  })
  .refine(
    (profile) => profile.candidateCount * profile.imagesPerCandidate <= 12,
    "单轮最多生成 12 张图。"
  );
export type BookTitleDesignProfile = z.infer<
  typeof BookTitleDesignProfileSchema
>;
export type BookSynopsisDesignProfile = z.infer<
  typeof BookSynopsisDesignProfileSchema
>;
export type BookCoverDesignProfile = z.infer<
  typeof BookCoverDesignProfileSchema
>;
