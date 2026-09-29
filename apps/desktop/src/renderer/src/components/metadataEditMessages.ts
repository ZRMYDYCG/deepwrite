import type { updateMaterialMarkdownMetadata } from "@deepwrite/contracts/renderer";
type MaterialMetadataEditResult = ReturnType<
  typeof updateMaterialMarkdownMetadata
>;
import { createScopedTranslator } from "../i18n";

const t = createScopedTranslator("components.metadataEditMessages");
type MetadataFailure = Extract<MaterialMetadataEditResult, { updated: false }>;
const messageKeys = {
  malformed_material_header: "malformedMaterialHeader",
  missing_skill_fields: "missingSkillFields",
  unclosed_skill_header: "unclosedSkillHeader",
  complex_skill_header: "complexSkillHeader",
  skill_header_bom: "skillHeaderBom"
} as const satisfies Record<MetadataFailure["code"], Parameters<typeof t>[0]>;

export function metadataEditFailureMessage(result: MetadataFailure): string {
  return t(messageKeys[result.code]);
}
