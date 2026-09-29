import { formatError } from "../../i18n/errors";
import type { LongBookAnalysisNote } from "@deepwrite/contracts/renderer";
import { createId } from "@deepwrite/shared";

export function analysisErrorMessage(error: unknown, fallback: string): string {
  return formatError(error, fallback) || fallback;
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
