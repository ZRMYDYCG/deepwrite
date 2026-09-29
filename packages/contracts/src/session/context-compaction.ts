import { z } from "zod";
import { AgentEventIdentitySchema } from "./agent-event-identity";
import { ConversationCheckpointSchema } from "./context-compaction-state";
export * from "./context-compaction-defaults";
export * from "./context-compaction-state";

export const AgentContextCompactionReasonSchema = z.enum([
  /** The context passed the working budget before a reply. */
  "threshold",
  /** The provider rejected the request as too long. */
  "overflow",
  /** The user asked for it. */
  "manual",
  /** Prepare a completed conversation for its next reply. */
  "idle",
  /** A single long run crossed the model limit between two turns. */
  "run_limit"
]);
export type AgentContextCompactionReason = z.infer<
  typeof AgentContextCompactionReasonSchema
>;

export const AgentContextCompactionLevelSchema = z.enum([
  /** Old tool output, snapshots and prose bodies were replaced by stubs. */
  "prune",
  /** Older turns were summarized into a checkpoint. */
  "summary"
]);
export type AgentContextCompactionLevel = z.infer<
  typeof AgentContextCompactionLevelSchema
>;

export const AgentContextCompactionPayloadSchema =
  AgentEventIdentitySchema.extend({
    phase: z.enum(["started", "completed", "failed"]),
    reason: AgentContextCompactionReasonSchema,
    level: AgentContextCompactionLevelSchema.optional(),
    tokensBefore: z.number().int().nonnegative().optional(),
    tokensAfter: z.number().int().nonnegative().optional(),
    /** Present when a new summary checkpoint replaced older turns. */
    checkpoint: ConversationCheckpointSchema.optional(),
    errorMessage: z.string().trim().min(1).max(4_000).optional()
  }).superRefine((value, context) => {
    if (value.phase === "failed" && !value.errorMessage) {
      context.addIssue({
        code: "custom",
        path: ["errorMessage"],
        message: "A failed compaction must explain the failure."
      });
    }
    if (value.checkpoint && value.level !== "summary") {
      context.addIssue({
        code: "custom",
        path: ["checkpoint"],
        message: "Only summary compaction produces a checkpoint."
      });
    }
  });
export type AgentContextCompactionPayload = z.infer<
  typeof AgentContextCompactionPayloadSchema
>;
