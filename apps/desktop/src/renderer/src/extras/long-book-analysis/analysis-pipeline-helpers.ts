import type { LongBookAnalysisNote } from "@deepwrite/contracts/renderer";
import { createId } from "@deepwrite/shared";

export function analysisErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function createAnalysisNote(
  text: string,
  label: string,
  chapterStart: number,
  chapterEnd: number
): LongBookAnalysisNote {
  return {
    id: createId("analysis_note"),
    label,
    chapterStart,
    chapterEnd,
    text
  };
}
