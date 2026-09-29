import { z } from "zod";
import { AgentEventIdentitySchema } from "./agent-event-identity";

export const AgentEvaluationToolConfigurationSchema = z.object({
  name: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  description: z.string(),
  inputSchema: z.unknown(),
  executionMode: z.string().trim().min(1).optional()
});
export type AgentEvaluationToolConfiguration = z.infer<
  typeof AgentEvaluationToolConfigurationSchema
>;

export const AgentEvaluationHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  text: z.string().max(8_000),
  toolName: z.string().trim().min(1).optional(),
  toolCallId: z.string().trim().min(1).optional(),
  isError: z.boolean().optional()
});
export type AgentEvaluationHistoryMessage = z.infer<
  typeof AgentEvaluationHistoryMessageSchema
>;

/**
 * Exact run-time evidence captured only when DeepWrite is explicitly started
 * in evaluation mode. It deliberately excludes provider credentials and image
 * bytes while preserving every text fragment injected into the model turn,
 * plus a compact, truncated copy of the model-visible message array.
 */
export const AgentEvaluationSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.string().datetime(),
  systemPrompt: z.string(),
  runtimeContext: z.object({
    kind: z.enum(["initial-session-context", "turn-context"]),
    text: z.string()
  }),
  tools: z.array(AgentEvaluationToolConfigurationSchema),
  conversationHistory: z.array(AgentEvaluationHistoryMessageSchema).optional()
});
export type AgentEvaluationSnapshot = z.infer<
  typeof AgentEvaluationSnapshotSchema
>;

export const AgentEvaluationSnapshotPayloadSchema =
  AgentEventIdentitySchema.extend({
    snapshot: AgentEvaluationSnapshotSchema
  });
export type AgentEvaluationSnapshotPayload = z.infer<
  typeof AgentEvaluationSnapshotPayloadSchema
>;
