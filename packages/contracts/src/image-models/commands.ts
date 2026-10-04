import { z } from "zod";
import { EnvelopeBaseSchema } from "../envelope";
import {
  BookIdentityIdSchema,
  CoverAspectRatioSchema
} from "../book-identity/limits";
import { ImageModelSettingsInputSchema } from "./settings";
export const ImageModelTestInputSchema = z
  .object({
    requestId: BookIdentityIdSchema,
    profileId: BookIdentityIdSchema,
    prompt: z.string().trim().min(1).max(8000),
    aspectRatio: CoverAspectRatioSchema
  })
  .strict();
export type ImageModelTestInput = z.infer<typeof ImageModelTestInputSchema>;
export const ImageModelTestResultSchema = z
  .object({
    requestId: BookIdentityIdSchema,
    previewDataUrl: z
      .string()
      .max(4 * 1024 * 1024)
      .regex(/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096)
  })
  .strict();
export type ImageModelTestResult = z.infer<typeof ImageModelTestResultSchema>;
export const ImageModelCancelInputSchema = z
  .object({ requestId: BookIdentityIdSchema })
  .strict();
export const ImageModelCancelResultSchema = z
  .object({ cancelled: z.boolean() })
  .strict();
const envelope = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  EnvelopeBaseSchema.extend({ type: z.literal(type), payload });
export const ImageModelCommandSchemas = [
  envelope("imageModels.getSettings", z.object({}).strict()),
  envelope("imageModels.saveSettings", ImageModelSettingsInputSchema),
  envelope("imageModels.getUsage", z.object({}).strict()),
  envelope("imageModels.test", ImageModelTestInputSchema),
  envelope("imageModels.cancel", ImageModelCancelInputSchema)
] as const;
export const ImageModelsCommandSchemas = ImageModelCommandSchemas;
