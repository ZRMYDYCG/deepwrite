import { z } from "zod";
import { AgentEventIdentitySchema } from "./agent-events";

/**
 * Conversation context compaction. The runtime replaces older turns with a
 * structured checkpoint summary; the checkpoint is persisted with the
 * conversation so a restarted runtime can resume from it instead of from a
 * truncated transcript.
 */

export const CONTEXT_CHECKPOINT_SUMMARY_MAX_LENGTH = 40_000;
export const CONTEXT_COMPACTION_INSTRUCTIONS_MAX_LENGTH = 1_000;
export const CONTEXT_COMPACTION_BUDGET_MIN_TOKENS = 16_000;
export const CONTEXT_COMPACTION_BUDGET_MAX_TOKENS = 2_000_000;
export const DEFAULT_CONTEXT_COMPACTION_BUDGET_TOKENS = 160_000;

const ContextReferenceSchema = z.string().trim().min(1).max(300);

/** Business references tracked by the runtime, never by the summary model. */
export const ContextCheckpointRefsSchema = z.object({
  /** Objects the agent read in full (`kind:id` or titles). */
  read: z.array(ContextReferenceSchema).max(300).default([]),
  /** Objects the agent proposed to create, change or delete. */
  proposed: z.array(ContextReferenceSchema).max(300).default([]),
  /** Skill titles loaded with `load_skill`, most recent last. */
  skills: z.array(ContextReferenceSchema).max(100).default([]),
  /** Material entries the agent read or searched. */
  materials: z.array(ContextReferenceSchema).max(300).default([])
});
export type ContextCheckpointRefs = z.infer<typeof ContextCheckpointRefsSchema>;

export const ConversationCheckpointSchema = z.object({
  summary: z.string().trim().min(1).max(CONTEXT_CHECKPOINT_SUMMARY_MAX_LENGTH),
  /**
   * The oldest run whose messages were kept verbatim. Absent when every run
   * before the compacting run was summarized.
   */
  firstKeptRunId: z.string().min(1).max(200).optional(),
  /** Stable boundary for older conversations without run ids. */
  firstKeptCreatedAt: z.string().datetime().optional(),
  tokensBefore: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  refs: ContextCheckpointRefsSchema.optional()
});
export type ConversationCheckpoint = z.infer<
  typeof ConversationCheckpointSchema
>;

/** A user-requested compaction applied before the next reply. */
export const ContextCompactionRequestSchema = z.object({
  instructions: z
    .string()
    .trim()
    .max(CONTEXT_COMPACTION_INSTRUCTIONS_MAX_LENGTH)
    .optional()
});
export type ContextCompactionRequest = z.infer<
  typeof ContextCompactionRequestSchema
>;

export const ContextCompactionSettingsSchema = z.object({
  /** Automatic compaction; manual compaction stays available when off. */
  enabled: z.boolean().default(true),
  /**
   * Working budget. Compaction keeps the context well below this even when
   * the model window is larger, because long contexts dilute instructions.
   */
  budgetTokens: z
    .number()
    .int()
    .min(CONTEXT_COMPACTION_BUDGET_MIN_TOKENS)
    .max(CONTEXT_COMPACTION_BUDGET_MAX_TOKENS)
    .default(DEFAULT_CONTEXT_COMPACTION_BUDGET_TOKENS),
  /** Model config used for summaries; the run model when absent. */
  modelId: z.string().min(1).max(120).optional()
});
export type ContextCompactionSettings = z.infer<
  typeof ContextCompactionSettingsSchema
>;

export function createDefaultContextCompactionSettings(): ContextCompactionSettings {
  return {
    enabled: true,
    budgetTokens: DEFAULT_CONTEXT_COMPACTION_BUDGET_TOKENS
  };
}

/** Main-resolved settings the Agent Utility applies to one run. */
export const ContextCompactionRunSettingsSchema = z.object({
  enabled: z.boolean(),
  budgetTokens: z
    .number()
    .int()
    .min(CONTEXT_COMPACTION_BUDGET_MIN_TOKENS)
    .max(CONTEXT_COMPACTION_BUDGET_MAX_TOKENS)
});
export type ContextCompactionRunSettings = z.infer<
  typeof ContextCompactionRunSettingsSchema
>;

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
