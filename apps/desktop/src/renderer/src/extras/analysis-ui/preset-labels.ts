import type { LongBookAnalysisPreset } from "@deepwrite/contracts/renderer";
import { i18n, t } from "../../i18n";

const defaultKeys = {
  "plot-structure": {
    name: "plotName",
    short: "shortPlotDescription",
    long: "longPlotDescription"
  },
  character: {
    name: "characterName",
    short: "characterDescription",
    long: "characterDescription"
  },
  style: {
    name: "styleName",
    short: "shortStyleDescription",
    long: "longStyleDescription"
  }
} as const;

/** Translate only unchanged built-in metadata. Custom edits remain user content. */
export function presetLabel(
  preset: LongBookAnalysisPreset,
  field: "name" | "description" = "name"
): string {
  const stored = preset[field];
  if (!preset.builtin || !Object.hasOwn(defaultKeys, preset.id)) return stored;
  const keys = defaultKeys[preset.id as keyof typeof defaultKeys];
  const key =
    field === "name"
      ? keys.name
      : "selectionMode" in preset
        ? keys.short
        : keys.long;
  const defaults = i18n.global.getLocaleMessage("zh-CN").extras.builtinPresets;
  return stored === defaults[key] ? t(`extras.builtinPresets.${key}`) : stored;
}
