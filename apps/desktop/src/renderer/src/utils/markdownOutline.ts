import { t } from "../i18n";
export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface ParsedMarkdownHeading {
  level: MarkdownHeadingLevel;
  source: string;
  label: string;
}

export interface MarkdownHeading extends ParsedMarkdownHeading {
  index: number;
}

function readableHeadingLabel(source: string): string {
  const codeTokens: string[] = [];
  const tokenized = source.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(code);
    return token;
  });

  let label = tokenized
    .replace(/!\[([^\]\n]*)\]\([^\n)]*\)/g, "$1")
    .replace(/\[([^\]\n]+)\]\([^\n)]*\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1");

  for (const [index, code] of codeTokens.entries()) {
    label = label.replace(`\u0000CODE${index}\u0000`, code);
  }

  return (
    label.replace(/\s+/g, " ").trim() ||
    t("workspace.markdownOutline.untitledHeading")
  );
}

export function parseMarkdownHeadingLine(
  line: string
): ParsedMarkdownHeading | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;

  const source = match[2] ?? "";
  return {
    level: (match[1]?.length ?? 1) as MarkdownHeadingLevel,
    source,
    label: readableHeadingLabel(source)
  };
}

export function extractMarkdownHeadings(source: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  let fenced = false;

  for (const line of lines) {
    if (fenced) {
      if (/^```\s*$/.test(line)) fenced = false;
      continue;
    }

    if (/^```[\w-]*\s*$/.test(line)) {
      fenced = true;
      continue;
    }

    const heading = parseMarkdownHeadingLine(line);
    if (!heading) continue;
    headings.push({ ...heading, index: headings.length });
  }

  return headings;
}
