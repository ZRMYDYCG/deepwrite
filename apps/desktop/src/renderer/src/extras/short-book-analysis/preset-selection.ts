import type { ShortBookAnalysisPreset } from "@deepwrite/contracts/renderer";
import { PRESET_BATCH_MAX_PRESETS } from "../analysis-ui/preset-batch";

export const SHORT_ANALYSIS_MAX_BOOKS = 10;

/** Any single-story preset limits the whole analysis to one story. */
export function shortSelectionLimit(
  presets: readonly Pick<ShortBookAnalysisPreset, "selectionMode">[]
): number {
  return presets.some((preset) => preset.selectionMode === "single")
    ? 1
    : SHORT_ANALYSIS_MAX_BOOKS;
}

export type ShortPresetBlock = "limit" | "single" | null;

/**
 * Why an unselected preset cannot be added: the preset limit, or a
 * single-story preset while several stories are selected. Existing story
 * choices are never dropped to make room for a preset.
 */
export function shortPresetBlock(
  preset: ShortBookAnalysisPreset,
  selectedPresetIds: readonly string[],
  selectedBookCount: number
): ShortPresetBlock {
  if (selectedPresetIds.includes(preset.id)) return null;
  if (selectedPresetIds.length >= PRESET_BATCH_MAX_PRESETS) return "limit";
  if (preset.selectionMode === "single" && selectedBookCount > 1)
    return "single";
  return null;
}
