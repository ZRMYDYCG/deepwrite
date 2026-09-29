import { z } from "zod";
import {
  CONTEXT_CHECKPOINT_SUMMARY_MAX_LENGTH,
  CONTEXT_COMPACTION_INSTRUCTIONS_MAX_LENGTH,
  CONTEXT_COMPACTION_BUDGET_MIN_TOKENS,
  CONTEXT_COMPACTION_BUDGET_MAX_TOKENS,
  DEFAULT_CONTEXT_COMPACTION_BUDGET_TOKENS
} from "./context-compaction-defaults";

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
  /** Whether the manual compaction button appears in conversation composers. */
  showManualButton: z.boolean().default(false),
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
