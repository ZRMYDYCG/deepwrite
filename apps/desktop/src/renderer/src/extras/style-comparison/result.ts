import { createScopedTranslator } from "../../i18n";
import {
  StyleComparisonDimensionSchema,
  type StyleComparisonDimension
} from "@deepwrite/contracts/renderer";

const t = createScopedTranslator("extras.styleComparison");

// Show only complete public findings while JSON is streaming. Never infer a
// final score from partial output or display the raw JSON / thinking events.
export function styleComparisonPreview(text: string): {
  summary: string;
  dimensions: StyleComparisonDimension[];
} {
  const summaryMatch = /"summary"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(text);
  let summary = "";
  try {
    summary = summaryMatch ? String(JSON.parse(summaryMatch[1]!)) : "";
  } catch {
    /* Incomplete stream. */
  }
  const dimensions: StyleComparisonDimension[] = [];
  for (const match of text.matchAll(/\{(?:[^{}"\\]|"(?:[^"\\]|\\.)*")*\}/g)) {
    try {
      const parsed = StyleComparisonDimensionSchema.safeParse(
        JSON.parse(match[0])
      );
      if (parsed.success && dimensions.length < 6) dimensions.push(parsed.data);
    } catch {
      /* Incomplete stream. */
    }
  }
  return { summary: summary.slice(0, 800), dimensions };
}

export function similarityLabel(score: number): string {
  if (score >= 80) return t("highlySimilar");
  if (score >= 60) return t("fairlySimilar");
  if (score >= 40) return t("partlySimilar");
  if (score >= 20) return t("clearlyDifferent");
  return t("veryDifferent");
}

export function styleComparisonPublicOutput(text: string): string {
  const preview = styleComparisonPreview(text);
  const findings = [
    preview.summary,
    ...preview.dimensions.map((item) => `### ${item.name}\n${item.reason}`)
  ]
    .filter(Boolean)
    .join("\n\n");
  return findings || (/^\s*(?:\{|```)/.test(text) ? "" : text.slice(-20_000));
}
