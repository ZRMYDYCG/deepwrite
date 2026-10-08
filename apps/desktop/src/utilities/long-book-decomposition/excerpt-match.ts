/**
 * Models copy quotes with small drift: paragraph breaks dropped, "……"
 * written as "...", straight quotes for curly ones, half-width commas.
 * Matching folds that drift away, and the caller stores the exact source
 * span, so saved excerpts stay verbatim without costing a resubmission.
 */
const QUOTES: Record<string, string> = {
  "“": '"',
  "”": '"',
  "„": '"',
  "「": '"',
  "」": '"',
  "『": '"',
  "』": '"',
  "‘": "'",
  "’": "'"
};

interface Folded {
  text: string;
  /** Source span of each folded character. */
  spans: Array<[number, number]>;
}

function fold(text: string): Folded {
  const chars: string[] = [];
  const spans: Array<[number, number]> = [];
  let index = 0;
  for (const char of text) {
    const end = index + char.length;
    const normalized = char.normalize("NFKC");
    if (!/^\s*$/u.test(normalized))
      for (const part of normalized) {
        chars.push(QUOTES[part] ?? (part === "。" ? "." : part));
        spans.push([index, end]);
      }
    index = end;
  }
  // "…", "……", "..." and "。。。" all fold to one ellipsis mark.
  const folded: Folded = { text: "", spans: [] };
  for (let at = 0; at < chars.length;) {
    let run = at;
    while (chars[run] === ".") run++;
    if (run - at >= 2) {
      folded.text += "…";
      folded.spans.push([spans[at]![0], spans[run - 1]![1]]);
      at = run;
    } else {
      folded.text += chars[at];
      folded.spans.push(spans[at]!);
      at++;
    }
  }
  return folded;
}

/** The exact source span an excerpt was copied from, or null. */
export function locateDecompositionExcerpt(
  source: string,
  excerpt: string
): string | null {
  if (source.includes(excerpt)) return excerpt;
  const needle = fold(excerpt).text;
  if (!needle) return null;
  const haystack = fold(source);
  const start = haystack.text.indexOf(needle);
  if (start < 0) return null;
  return source.slice(
    haystack.spans[start]![0],
    haystack.spans[start + needle.length - 1]![1]
  );
}
