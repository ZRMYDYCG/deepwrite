import { z } from "zod";
import { AgentUsageSchema } from "../agent-usage";
import { SubagentAuthoringDraftSchema } from "../subagent-authoring";
import {
  AgentEventIdentitySchema,
  AgentRuntimeRefSchema
} from "./agent-event-identity";

export { AgentEventIdentitySchema } from "./agent-event-identity";

export const AgentTurnStartedFieldsSchema = z.object({
  turnId: z.string().min(1),
  attempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive()
});

export const AgentRetryScheduledFieldsSchema = z.object({
  turnId: z.string().min(1),
  failedAttempt: z.number().int().positive(),
  nextAttempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  delayMs: z.number().int().nonnegative(),
  retryAt: z.string().datetime(),
  reason: z.string().trim().min(1).max(4_000)
});

export function validateTurnAttempt(
  value: { attempt: number; maxAttempts: number },
  context: z.core.$RefinementCtx<unknown>
): void {
  if (value.attempt > value.maxAttempts) {
    context.addIssue({
      code: "custom",
      path: ["attempt"],
      message: "Attempt must not exceed maxAttempts."
    });
  }
}

export function validateRetryAttempt(
  value: { failedAttempt: number; nextAttempt: number; maxAttempts: number },
  context: z.core.$RefinementCtx<unknown>
): void {
  if (value.nextAttempt !== value.failedAttempt + 1) {
    context.addIssue({
      code: "custom",
      path: ["nextAttempt"],
      message: "nextAttempt must immediately follow failedAttempt."
    });
  }
  if (value.nextAttempt > value.maxAttempts) {
    context.addIssue({
      code: "custom",
      path: ["nextAttempt"],
      message: "nextAttempt must not exceed maxAttempts."
    });
  }
}

export const AgentTurnStartedPayloadSchema = AgentEventIdentitySchema.extend(
  AgentTurnStartedFieldsSchema.shape
).superRefine(validateTurnAttempt);
export type AgentTurnStartedPayload = z.infer<
  typeof AgentTurnStartedPayloadSchema
>;

export const AgentRetryScheduledPayloadSchema = AgentEventIdentitySchema.extend(
  AgentRetryScheduledFieldsSchema.shape
).superRefine(validateRetryAttempt);
export type AgentRetryScheduledPayload = z.infer<
  typeof AgentRetryScheduledPayloadSchema
>;

export const AgentMessageDeltaPayloadSchema = AgentEventIdentitySchema.extend({
  delta: z.string()
});
export type AgentMessageDeltaPayload = z.infer<
  typeof AgentMessageDeltaPayloadSchema
>;

export const AgentThinkingDeltaPayloadSchema = AgentEventIdentitySchema.extend({
  delta: z.string()
});
export type AgentThinkingDeltaPayload = z.infer<
  typeof AgentThinkingDeltaPayloadSchema
>;

export const AgentUsageObservationStatusSchema = z.enum([
  "completed",
  "error",
  "aborted"
]);
export type AgentUsageObservationStatus = z.infer<
  typeof AgentUsageObservationStatusSchema
>;

/**
 * One provider-returned assistant message, including intermediate tool-call
 * turns and retry attempts. This is an internal accounting event: consumers
 * must not derive usage from `agent.message_completed` or `subagent.completed`,
 * because those UI lifecycle events deliberately omit intermediate turns.
 */
export const AgentUsageObservedPayloadSchema = AgentEventIdentitySchema.extend({
  /** Stable retry-safe id for local at-least-once persistence. */
  // Main prefixes this with `v2:` before persisting it in a 240-character
  // ModelUsageRecord id, so reserve those three characters here.
  observationId: z.string().trim().min(1).max(237),
  observedAt: z.string().datetime(),
  turnId: z.string().min(1),
  attempt: z.number().int().positive(),
  status: AgentUsageObservationStatusSchema,
  hadToolCall: z.boolean(),
  usage: AgentUsageSchema,
  /** Present only when this model message came from a delegated child run. */
  parentToolCallId: z.string().min(1).optional(),
  subagentRunId: z.string().min(1).optional(),
  subagentId: z.string().min(1).max(120).optional()
});
export type AgentUsageObservedPayload = z.infer<
  typeof AgentUsageObservedPayloadSchema
>;

export const AgentMessageCompletedPayloadSchema =
  AgentEventIdentitySchema.extend({
    role: z.literal("assistant"),
    content: z.string(),
    thinking: z.string().optional(),
    stopReason: z.string().min(1).optional(),
    usage: AgentUsageSchema.optional()
  });
export type AgentMessageCompletedPayload = z.infer<
  typeof AgentMessageCompletedPayloadSchema
>;

export const AgentToolRequestedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown(),
  runtime: AgentRuntimeRefSchema
});
export type AgentToolRequestedPayload = z.infer<
  typeof AgentToolRequestedPayloadSchema
>;

export const AgentToolCallStreamPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  streamId: z.string().min(1),
  toolCallId: z.string().min(1).optional(),
  toolName: z.string().min(1).optional(),
  phase: z.enum(["start", "delta", "end"]),
  argumentsDelta: z.string(),
  args: z.unknown().optional(),
  runtime: AgentRuntimeRefSchema
});
export type AgentToolCallStreamPayload = z.infer<
  typeof AgentToolCallStreamPayloadSchema
>;

export const AgentToolCompletedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  resultSummary: z.string().max(4_000),
  isError: z.boolean(),
  runtime: AgentRuntimeRefSchema
});
export type AgentToolCompletedPayload = z.infer<
  typeof AgentToolCompletedPayloadSchema
>;

export const SubagentAuthoringDraftUpdatedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  draft: SubagentAuthoringDraftSchema,
  runtime: AgentRuntimeRefSchema
});
export type SubagentAuthoringDraftUpdatedPayload = z.infer<
  typeof SubagentAuthoringDraftUpdatedPayloadSchema
>;

export const AgentErrorPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  runtime: AgentRuntimeRefSchema.optional()
});
export type AgentErrorPayload = z.infer<typeof AgentErrorPayloadSchema>;
