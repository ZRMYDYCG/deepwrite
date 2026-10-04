import { z } from "zod";
import { DecompositionIdSchema } from "./limits";
import { DecompositionContentRefSchema } from "./target";

const absolutePath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      path.startsWith("/") ||
      /^[A-Za-z]:[\\/]/u.test(path) ||
      path.startsWith("\\\\"),
    "目标父目录必须是绝对路径。"
  );
export const DecompositionTargetPreparationSchema = z
  .object({
    operationId: DecompositionIdSchema,
    bookId: DecompositionIdSchema,
    groupId: DecompositionIdSchema,
    libraryIds: z.object({
      character: DecompositionIdSchema,
      plot: DecompositionIdSchema,
      draft: DecompositionIdSchema,
      other: DecompositionIdSchema,
      gimmick: DecompositionIdSchema
    }),
    paths: z.object({
      book: absolutePath,
      materials: absolutePath,
      groups: absolutePath
    }),
    steps: z
      .array(
        z.enum([
          "created",
          "source-initialized",
          "source-written",
          "group-bound",
          "library:character",
          "library:plot",
          "library:draft",
          "library:other",
          "library:gimmick"
        ])
      )
      .max(9)
  })
  .strict();
export const DecompositionCompletionSchema = z
  .object({
    commitId: DecompositionIdSchema.optional(),
    finalized: z.boolean().optional(),
    postCommitRefs: z
      .record(
        DecompositionIdSchema,
        z.array(DecompositionContentRefSchema).min(1).max(10_000)
      )
      .optional()
  })
  .strict();
