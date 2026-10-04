import { z } from "zod";

export const BOOK_IDENTITY_MAX_PROFILES = 20;
export const BOOK_IDENTITY_MAX_ROUNDS_PER_FIELD = 60;
export const BOOK_IDENTITY_MAX_IMAGES = 240;
export const BOOK_IDENTITY_MAX_RECORD_BYTES = 4 * 1024 * 1024;
export const BOOK_IDENTITY_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const BOOK_IDENTITY_MAX_COMPOSED_BYTES = 25 * 1024 * 1024;
export const BOOK_IDENTITY_MAX_IMAGE_EDGE = 4096;
export const BOOK_IDENTITY_IMAGE_TIMEOUT_MS = 180_000;
export const BOOK_IDENTITY_IMAGE_CONCURRENCY = 2;
export const BOOK_IDENTITY_MAX_IMAGES_PER_ROUND = 12;
export const BOOK_IDENTITY_MAX_BRIEF_LENGTH = 2000;
export const BOOK_IDENTITY_MAX_SEED_CANDIDATES = 5;
export const BOOK_IDENTITY_CANDIDATE_LIMITS = {
  title: 20,
  synopsis: 8,
  cover: 6
} as const;
export const BookIdentityFieldSchema = z.enum(["title", "synopsis", "cover"]);
export type BookIdentityField = z.infer<typeof BookIdentityFieldSchema>;
export const BookIdentityIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const CandidateIdSchema = BookIdentityIdSchema;
export const CoverAspectRatioSchema = z.enum([
  "3:4",
  "2:3",
  "9:16",
  "1:1",
  "16:9"
]);
export type CoverAspectRatio = z.infer<typeof CoverAspectRatioSchema>;
export const CoverTitleRenderingSchema = z.enum(["overlay", "model"]);
export type CoverTitleRendering = z.infer<typeof CoverTitleRenderingSchema>;
