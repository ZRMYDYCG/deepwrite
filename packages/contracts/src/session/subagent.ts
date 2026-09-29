import { z } from "zod";
import { AgentUsageSchema } from "../agent-usage";
import {
  AgentRetryScheduledFieldsSchema,
  AgentTurnStartedFieldsSchema,
  validateRetryAttempt,
  validateTurnAttempt
} from "./agent-events";
import { AgentRuntimeRefSchema } from "./agent-event-identity";

export const SubagentEventBaseSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  parentToolCallId: z.string().min(1),
  subagentRunId: z.string().min(1),
  subagentId: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  runtime: AgentRuntimeRefSchema
});
export type SubagentEventBase = z.infer<typeof SubagentEventBaseSchema>;

export const SubagentActivitySchema = z.discriminatedUnion("type", [
  AgentTurnStartedFieldsSchema.extend({
    type: z.literal("turn_started")
  }).superRefine(validateTurnAttempt),
  AgentRetryScheduledFieldsSchema.extend({
    type: z.literal("retry_scheduled")
  }).superRefine(validateRetryAttempt),
  z.object({
    type: z.literal("thinking_delta"),
    delta: z.string()
  }),
  z.object({
    type: z.literal("message_delta"),
    delta: z.string()
  }),
  z.object({
    type: z.literal("tool_requested"),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    args: z.unknown()
  }),
  z.object({
    type: z.literal("tool_completed"),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    resultSummary: z.string().max(4_000),
    isError: z.boolean()
  })
]);
export type SubagentActivity = z.infer<typeof SubagentActivitySchema>;

export const SubagentStartedPayloadSchema = SubagentEventBaseSchema.extend({
  task: z.string().trim().min(1).max(20_000)
});
export type SubagentStartedPayload = z.infer<
  typeof SubagentStartedPayloadSchema
>;

export const SubagentActivityPayloadSchema = SubagentEventBaseSchema.extend({
  activity: SubagentActivitySchema
});
export type SubagentActivityPayload = z.infer<
  typeof SubagentActivityPayloadSchema
>;

export const SubagentCompletedPayloadSchema = SubagentEventBaseSchema.extend({
  status: z.enum(["completed", "error", "aborted"]),
  summary: z.string().max(20_000),
  errorMessage: z.string().min(1).max(4_000).optional(),
  usage: AgentUsageSchema.optional()
});
export type SubagentCompletedPayload = z.infer<
  typeof SubagentCompletedPayloadSchema
>;
