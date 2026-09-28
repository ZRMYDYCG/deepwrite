import { z } from "zod";
export const REVISION_TEXT_LIMIT = 100_000;
export const REVISION_METHOD_LIMIT = 16_000;
export const REVISION_REASON_LIMIT = 4_000;
const text = z
  .string()
  .max(REVISION_TEXT_LIMIT)
  .refine((v) => Boolean(v.trim()), "请粘贴正文。");
export const RevisionChangeSchema = z.object({
  id: z.string().min(1).max(120),
  before: z.string().max(REVISION_TEXT_LIMIT),
  after: z.string().max(REVISION_TEXT_LIMIT),
  beforeStart: z.number().int().nonnegative(),
  afterStart: z.number().int().nonnegative(),
  reason: z.string().max(REVISION_REASON_LIMIT),
  coarse: z.boolean()
});
export const RevisionAnalysisInputSchema = z
  .object({
    beforeText: text,
    afterText: text,
    changes: z.array(RevisionChangeSchema).min(1).max(100_000),
    overallReason: z.string().max(REVISION_REASON_LIMIT)
  })
  .superRefine((v, ctx) => {
    if (new Set(v.changes.map((c) => c.id)).size !== v.changes.length)
      ctx.addIssue({
        code: "custom",
        message: "差异编号不能重复。",
        path: ["changes"]
      });
    if (v.changes.some((c) => c.before === c.after))
      ctx.addIssue({
        code: "custom",
        message: "差异组必须包含变化。",
        path: ["changes"]
      });
  });
export const RevisionAnalysisRuntimeContextSchema =
  RevisionAnalysisInputSchema.safeExtend({ jobId: z.string().min(1).max(120) });
export const RevisionAnalysisSkillDraftSchema = z.object({
  title: z.string().trim().min(1).max(256),
  description: z.string().trim().min(1).max(4_000),
  content: z.string().trim().min(1).max(200_000)
});
export const RevisionAnalysisResultSchema = z.object({
  // A draft can arrive before the assistant's report text.
  report: z.string().trim().max(200_000),
  title: RevisionAnalysisSkillDraftSchema.shape.title,
  description: RevisionAnalysisSkillDraftSchema.shape.description,
  body: RevisionAnalysisSkillDraftSchema.shape.content
});
export type RevisionChange = z.infer<typeof RevisionChangeSchema>;
export type RevisionAnalysisInput = z.infer<typeof RevisionAnalysisInputSchema>;
export type RevisionAnalysisRuntimeContext = z.infer<
  typeof RevisionAnalysisRuntimeContextSchema
>;
export type RevisionAnalysisResult = z.infer<
  typeof RevisionAnalysisResultSchema
>;
