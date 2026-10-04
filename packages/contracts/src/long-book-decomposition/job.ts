import { z } from "zod";
import { ThinkingLevelSchema } from "../models";
import { decompositionInputBudget, DecompositionChunkSchema } from "./chunking";
import {
  DecompositionIdSchema,
  DecompositionPhaseSchema,
  DecompositionRangeSchema,
  DecompositionRunPhaseSchema
} from "./limits";
import { LongBookDecompositionProfileSchema } from "./profile";
import { DecompositionUsageSchema } from "./usage-schema";
import {
  DecompositionContentRefSchema,
  DecompositionTargetSchema,
  DecompositionTargetSelectionSchema
} from "./target";

export const DecompositionSourceRefSchema = z.object({
  sourceId: DecompositionIdSchema,
  sourceRevision: z.number().int().positive(),
  title: z.string().min(1).max(1024),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  confirmationId: DecompositionIdSchema,
  confirmedAt: z.string().datetime(),
  chapterCount: z.number().int().min(1).max(10_000),
  characterCount: z.number().int().min(1).max(20_000_000),
  range: DecompositionRangeSchema
});
export const DecompositionUnitSchema = z.object({
  phase: DecompositionPhaseSchema,
  status: z.enum([
    "pending",
    "running",
    "writing",
    "done",
    "failed",
    "skipped",
    "conflict"
  ]),
  attempts: z.number().int().nonnegative(),
  inputRevision: z.string().min(1).max(256),
  dependencies: z.array(DecompositionIdSchema).default([]),
  runId: z.string().optional(),
  attemptId: DecompositionIdSchema.optional(),
  outputRefs: z.array(DecompositionContentRefSchema).default([]),
  receiptIds: z.array(DecompositionIdSchema).default([]),
  lastError: z.string().max(2000).optional(),
  updatedAt: z.string().datetime(),
  requiredReceiptIds: z.array(DecompositionIdSchema).optional(),
  regenerateApproved: z.boolean().optional(),
  conflictResolution: z.literal("keep-user").optional(),
  biography: z
    .object({
      registryId: DecompositionIdSchema,
      volume: z.string().min(1).max(256),
      startOrder: z.number().int().min(1).max(10_000),
      endOrder: z.number().int().min(1).max(10_000)
    })
    .optional(),
  topic: z
    .object({
      domain: z.enum(["world", "character", "plot", "style"]),
      title: z.string().min(1).max(120)
    })
    .optional()
});
export type DecompositionUnit = z.infer<typeof DecompositionUnitSchema>;
const model = z.object({
  modelId: z.string().min(1).max(120),
  thinkingLevel: ThinkingLevelSchema,
  contextWindow: z.number().int().min(16_000),
  maxTokens: z.number().int().positive().optional()
});
export const LongBookDecompositionJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: DecompositionIdSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    mode: z.enum(["continuation", "materials"]),
    outputVersion: z.number().int().positive(),
    targetSelection: DecompositionTargetSelectionSchema,
    target: DecompositionTargetSchema.optional(),
    source: DecompositionSourceRefSchema,
    profile: LongBookDecompositionProfileSchema,
    models: z.object({ reading: model, integration: model }),
    chunks: z.array(DecompositionChunkSchema).min(1).max(100_000),
    chronicleSegments: z
      .array(
        z.object({
          id: DecompositionIdSchema,
          volume: z.string().optional(),
          chunkIds: z.array(DecompositionIdSchema).min(1)
        })
      )
      .default([]),
    phase: DecompositionPhaseSchema,
    status: z.enum(["idle", "running", "stopped", "failed", "completed"]),
    autoContinue: z.boolean(),
    units: z.record(DecompositionIdSchema, DecompositionUnitSchema),
    reusedFromJobId: DecompositionIdSchema.optional(),
    lastError: z.string().max(2000).optional(),
    activeAttemptId: DecompositionIdSchema.optional(),
    /** Model usage Main observed for this task's runs. */
    usage: DecompositionUsageSchema.optional(),
    /** Pause threshold the user raised; absent means the estimate default. */
    usageLimitTokens: z.number().int().positive().optional()
  })
  .superRefine((job, ctx) => {
    const kind = job.mode === "continuation" ? "long" : "material-group";
    if (
      job.targetSelection.kind !== kind ||
      (job.target && job.target.kind !== kind)
    )
      ctx.addIssue({ code: "custom", message: "目标与拆解模式不一致。" });
    if (job.phase !== "prepare_target" && !job.target)
      ctx.addIssue({ code: "custom", message: "拆解目标尚未准备。" });
  });
export type LongBookDecompositionJob = z.infer<
  typeof LongBookDecompositionJobSchema
>;
export const DecompositionTaskInputSchema = z
  .object({
    jobId: DecompositionIdSchema,
    phase: DecompositionRunPhaseSchema,
    unitIds: z.array(DecompositionIdSchema).min(1).max(20)
  })
  .refine(
    ({ unitIds }) => new Set(unitIds).size === unitIds.length,
    "工作包单元不能重复。"
  );
export const DecompositionResolvedInputSchema =
  DecompositionTaskInputSchema.safeExtend({
    outputVersion: z.number().int().positive(),
    attemptId: DecompositionIdSchema,
    mode: z.enum(["continuation", "materials"]),
    modelId: z.string().min(1),
    thinkingLevel: ThinkingLevelSchema,
    inputBudget: z.number().int().positive(),
    /** Capacity of the phase model; child budgets are shares of it. */
    contextWindow: z.number().int().min(16_000),
    maxTokens: z.number().int().positive().optional(),
    units: z.record(z.string(), DecompositionUnitSchema)
  });
export type DecompositionTaskInput = z.infer<
  typeof DecompositionTaskInputSchema
>;
export type DecompositionResolvedInput = z.infer<
  typeof DecompositionResolvedInputSchema
>;

/** Shared read-only view of the deterministic package plan. Core authorizes it again. */
export function readyDecompositionUnitIds(
  job: LongBookDecompositionJob
): string[] {
  const model =
    job.phase === "read" ? job.models.reading : job.models.integration;
  const packageSize = Math.min(
    20,
    Math.max(
      1,
      Math.floor(
        decompositionInputBudget(model, job.profile.systemPrompt.length) / 2000
      )
    )
  );
  return Object.entries(job.units)
    .filter(
      ([id, unit]) =>
        unit.phase === job.phase &&
        !id.startsWith("reading:") &&
        unit.status === "pending" &&
        unit.attempts < 3 &&
        (id.startsWith("chunk:") ||
          unit.dependencies.every((id) =>
            ["done", "skipped"].includes(job.units[id]?.status ?? "")
          ))
    )
    .map(([id]) => id)
    .slice(0, packageSize);
}
