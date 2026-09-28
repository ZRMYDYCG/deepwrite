import type { RevisionAnalysisInput } from "./revision-analysis";
import { shortAnalysisTokens } from "./short-book-analysis-budget";
export function assertRevisionAnalysisBudget(
  input: RevisionAnalysisInput,
  profile: { systemPrompt: string },
  model: { contextWindow?: number | undefined; maxTokens?: number | undefined }
) {
  const available = Math.floor(
    ((model.contextWindow ?? 272_000) - (model.maxTokens ?? 16_000) - 8_000) *
      0.6
  );
  const required =
    shortAnalysisTokens(profile.systemPrompt) +
    shortAnalysisTokens(JSON.stringify(input));
  if (required > available)
    throw new Error(
      "完整正文与修改理由超过当前模型上下文，请缩短正文或选择更大上下文的模型。内容不会被截断。"
    );
}
