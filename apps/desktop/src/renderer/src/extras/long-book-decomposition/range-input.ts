export interface ChapterRange {
  start: number;
  end: number;
}

/** Clamp typed values into the book and keep the pair ordered around the edited side. */
export function normalizeChapterRange(
  range: { start: unknown; end: unknown },
  total: number,
  anchor: "start" | "end"
): ChapterRange {
  const clamp = (value: unknown) =>
    Math.max(1, Math.min(Math.max(1, total), Math.round(Number(value) || 1)));
  const start = clamp(range.start);
  const end = clamp(range.end);
  return anchor === "start"
    ? { start, end: Math.max(start, end) }
    : { start: Math.min(start, end), end };
}
