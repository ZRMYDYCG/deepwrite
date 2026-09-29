import { z } from "zod";

export const AgentRuntimeRefSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  mode: z.enum(["local-faux", "provider"]),
  /**
   * The local model-configuration id that resolved this runtime. It is kept
   * optional for the built-in faux runtime and for historical event payloads.
   */
  configId: z.string().trim().min(1).max(120).optional()
});
export type AgentRuntimeRef = z.infer<typeof AgentRuntimeRefSchema>;

export const AgentEventIdentitySchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  messageId: z.string().min(1),
  runtime: AgentRuntimeRefSchema
});
