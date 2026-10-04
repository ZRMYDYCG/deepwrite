import { z } from "zod";
import { BookIdentityIdSchema } from "../book-identity/limits";
export const ImageUsageRecordSchema = z
  .object({
    requestId: BookIdentityIdSchema,
    profileId: BookIdentityIdSchema,
    model: z.string().min(1).max(160),
    images: z.number().int().nonnegative().max(12),
    size: z.string().max(80),
    durationMs: z.number().int().nonnegative(),
    status: z.enum(["success", "failed", "cancelled"]),
    createdAt: z.string().datetime()
  })
  .strict();
export type ImageUsageRecord = z.infer<typeof ImageUsageRecordSchema>;
export const ImageUsageSchema = z.array(ImageUsageRecordSchema).max(100);
