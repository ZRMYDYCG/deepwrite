import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import {
  RevisionAnalysisResultSchema,
  RevisionAnalysisSkillDraftSchema,
  type RevisionAnalysisResult
} from "@deepwrite/contracts";
import { piStrictToolSampling } from "../../pi-tool-schema";
import { extrasOutputResult, type ExtrasOutputTarget } from "../output";

/**
 * `create_skill_draft` plus the legacy combined submission. Both update the
 * preview only and share one submission per run.
 */
export function buildSkillDraftTools(target: ExtrasOutputTarget): AgentTool[] {
  let written = false;
  function submit(result: RevisionAnalysisResult) {
    if (written) throw new Error("本次分析只能提交一份结果。");
    written = true;
    return extrasOutputResult(
      target,
      "技能草稿已创建到预览，待用户确认保存。",
      {
        kind: "revision-analysis-result",
        result
      }
    );
  }
  const draftParameters = Type.Object(
    {
      title: Type.String({
        minLength: 1,
        maxLength: 256,
        description: "技能标题"
      }),
      description: Type.String({
        minLength: 1,
        maxLength: 4000,
        description: "技能用途与适用场景的简短描述"
      }),
      content: Type.String({
        minLength: 1,
        maxLength: 200000,
        description: "可独立复用的技能 Markdown 正文，不包含 frontmatter"
      })
    },
    { additionalProperties: false }
  );
  const legacyParameters = Type.Object({
    report: Type.String({ minLength: 1, maxLength: 200000 }),
    title: Type.String({ minLength: 1, maxLength: 256 }),
    description: Type.String({ minLength: 1, maxLength: 4000 }),
    body: Type.String({ minLength: 1, maxLength: 200000 })
  });
  return [
    {
      name: "create_skill_draft",
      label: "新建技能草稿",
      description:
        "根据修改分析新建一份可编辑的技能草稿。只需提供 title 标题、description 描述、content 内容；分析报告通过普通正文输出，无需放进工具参数。工具仅更新预览，保存到技能库需要用户确认。",
      parameters: draftParameters,
      ...piStrictToolSampling(draftParameters),
      execute: async (_id, params) => {
        const draft = RevisionAnalysisSkillDraftSchema.parse(params);
        return submit({
          report: "",
          title: draft.title,
          description: draft.description,
          body: draft.content
        });
      }
    },
    {
      name: "write_revision_analysis_result",
      label: "生成修改分析与技能",
      description:
        "一次提交完整的 report 修改分析报告、title 技能标题、description 技能用途与适用场景的简短描述、body 可复用技能正文。正文不需要包含 name / description 前置信息，保存时会自动生成。只更新预览，不保存到技能库。",
      parameters: legacyParameters,
      ...piStrictToolSampling(legacyParameters),
      execute: async (_id, params) => {
        if (written) throw new Error("本次分析只能提交一份结果。");
        const result = RevisionAnalysisResultSchema.parse(params);
        if (!result.report) throw new Error("请提供完整的修改分析报告。");
        return submit(result);
      }
    }
  ];
}
