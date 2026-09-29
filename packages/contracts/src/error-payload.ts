import { z } from "zod";

/** Plain rejection data survives Electron contextBridge; custom Error fields do not. */
export const ErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional()
});
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;
