import { t } from "../../i18n";
import {
  LongBookAnalysisResultSchema,
  parseSkillMarkdown,
  updateMaterialMarkdownMetadata,
  updateSkillMarkdownMetadata,
  type LongBookAnalysisResult
} from "@deepwrite/contracts/renderer";

/** Prepare an edited preview for the existing catalog save/conflict flow. */
export function analysisResultEntry(
  draft: LongBookAnalysisResult,
  domain: "material" | "skill"
): { title: string; content: string } {
  const result = LongBookAnalysisResultSchema.safeParse(draft);
  if (!result.success) {
    throw new Error(t("extras.longBookAnalysis.resultFieldsRequired"));
  }
  const { name, description, content } = result.data;
  const updated = (
    domain === "skill"
      ? updateSkillMarkdownMetadata
      : updateMaterialMarkdownMetadata
  )(content, { name, description });
  if (!updated.updated) throw new Error(updated.message);
  if (domain === "skill") {
    const parsed = parseSkillMarkdown(updated.content);
    if (!parsed.valid) throw new Error(parsed.message);
  }
  return { title: name, content: updated.content };
}
