import { z } from "zod";
import { HttpsBaseUrlSchema } from "../https-base-url";
import {
  CoverAspectRatioSchema,
  BookIdentityIdSchema
} from "../book-identity/limits";
import { ImagePresetIdSchema } from "./presets";

export const IMAGE_MODEL_MAX_PROFILES = 12;
export const ImageModelProfileSchema = z
  .object({
    id: BookIdentityIdSchema,
    presetId: ImagePresetIdSchema,
    name: z.string().trim().min(1).max(40),
    baseUrl: HttpsBaseUrlSchema,
    model: z.string().trim().min(1).max(160),
    defaultAspectRatio: CoverAspectRatioSchema,
    quality: z.enum(["standard", "high"]).optional(),
    watermark: z.boolean().optional(),
    hasApiKey: z.boolean()
  })
  .strict();
export type ImageModelProfile = z.infer<typeof ImageModelProfileSchema>;
export const ImageModelProfileInputSchema = ImageModelProfileSchema.omit({
  hasApiKey: true
}).extend({
  id: BookIdentityIdSchema.optional(),
  apiKey: z.string().trim().max(4096).optional(),
  clearApiKey: z.boolean().optional()
});
export type ImageModelProfileInput = z.infer<
  typeof ImageModelProfileInputSchema
>;
const activeProfileId = BookIdentityIdSchema.nullable();
function uniqueIds(
  value: { profiles: { id?: string | undefined }[] },
  context: z.core.$RefinementCtx<unknown>
) {
  const ids = value.profiles.flatMap((profile) =>
    profile.id ? [profile.id] : []
  );
  if (ids.length !== new Set(ids).size)
    context.addIssue({
      code: "custom",
      path: ["profiles"],
      message: "图片配置标识不能重复。"
    });
}
export const ImageModelSettingsSchema = z
  .object({
    activeProfileId,
    profiles: z.array(ImageModelProfileSchema).max(12)
  })
  .strict()
  .superRefine(uniqueIds);
export const ImageModelSettingsInputSchema = z
  .object({
    activeProfileId,
    profiles: z.array(ImageModelProfileInputSchema).max(12)
  })
  .strict()
  .superRefine(uniqueIds);
export type ImageModelSettings = z.infer<typeof ImageModelSettingsSchema>;
export type ImageModelSettingsInput = z.infer<
  typeof ImageModelSettingsInputSchema
>;
