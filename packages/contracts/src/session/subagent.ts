import { z } from "zod";
import { AgentUsageSchema } from "../agent-usage";
import {
  AgentRetryScheduledFieldsSchema,
  AgentTurnStartedFieldsSchema,
  validateRetryAttempt,
  validateTurnAttempt
} from "./agent-events";
import { AgentRuntimeRefSchema } from "./agent-event-identity";
import { SUBAGENT_TASK_BATCH_MAX_COUNT } from "../agent-team";

export const SUBAGENT_TASK_KEY_MAX_LENGTH = 40;
export const SubagentTaskKeySchema = z
  .string()
  .min(1)
  .max(SUBAGENT_TASK_KEY_MAX_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

/**
 * Position of a child inside one `spawn_subagent` task list. `dependsOn`
 * includes dependencies the scheduler added for overlapping write scopes.
 */
export const SubagentBatchTaskSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .max(SUBAGENT_TASK_BATCH_MAX_COUNT - 1),
  key: SubagentTaskKeySchema,
  dependsOn: z
    .array(SubagentTaskKeySchema)
    .max(SUBAGENT_TASK_BATCH_MAX_COUNT - 1)
});
export type SubagentBatchTask = z.infer<typeof SubagentBatchTaskSchema>;

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

/** One task of a multi-task call, known before any child starts. */
export const SubagentPlannedTaskSchema = SubagentBatchTaskSchema.extend({
  subagentId: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  task: z.string().trim().min(1).max(20_000),
  runtime: AgentRuntimeRefSchema
});
export type SubagentPlannedTask = z.infer<typeof SubagentPlannedTaskSchema>;

export const SubagentPlannedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  parentToolCallId: z.string().min(1),
  tasks: z
    .array(SubagentPlannedTaskSchema)
    .min(1)
    .max(SUBAGENT_TASK_BATCH_MAX_COUNT)
});
export type SubagentPlannedPayload = z.infer<
  typeof SubagentPlannedPayloadSchema
>;

export const SubagentStartedPayloadSchema = SubagentEventBaseSchema.extend({
  task: z.string().trim().min(1).max(20_000),
  batchTask: SubagentBatchTaskSchema.optional()
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
  /** `skipped`: never started because a dependency did not complete. */
  status: z.enum(["completed", "error", "aborted", "skipped"]),
  batchTask: SubagentBatchTaskSchema.optional(),
  summary: z.string().max(20_000),
  errorMessage: z.string().min(1).max(4_000).optional(),
  usage: AgentUsageSchema.optional()
});
export type SubagentCompletedPayload = z.infer<
  typeof SubagentCompletedPayloadSchema
>;
