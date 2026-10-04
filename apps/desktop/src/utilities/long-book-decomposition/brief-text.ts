import {
  CONSERVATIVE_TEXT_TOKEN_WEIGHTS,
  estimateTextTokens,
  type DecompositionReadingCard
} from "@deepwrite/contracts";

/** One titled part of an evidence pack; lines are kept or dropped whole. */
export interface BriefSection {
  title: string;
  lines: string[];
  /** Source text keeps its head and tail instead of sampled lines. */
  prose?: boolean;
}

export const briefTokens = (text: string) =>
  estimateTextTokens(text, CONSERVATIVE_TEXT_TOKEN_WEIGHTS);

export function factLine(fact: {
  chapterOrder: number;
  text: string;
  inferred?: boolean | undefined;
}): string {
  return `第${fact.chapterOrder}章：${fact.text}${fact.inferred ? "（推断）" : ""}`;
}

function headTail(text: string, budget: number): string {
  const characters = Math.max(200, Math.floor(budget / 1.5));
  if (text.length <= characters) return text;
  const head = Math.floor(characters * 0.7);
  const tail = characters - head;
  return `${text.slice(0, head)}\n〔中间 ${(text.length - characters).toLocaleString("zh-CN")} 字因证据预算省略〕\n${text.slice(text.length - tail)}`;
}

/** Evenly keeps lines across the whole range so late chapters are not lost. */
function sampleLines(lines: string[], budget: number): string[] {
  const kept: string[] = [];
  const total = lines.reduce((sum, line) => sum + briefTokens(line) + 1, 0);
  const ratio = Math.min(1, budget / Math.max(1, total));
  let credit = 0;
  let used = 0;
  for (const line of lines) {
    credit += ratio;
    if (credit < 1) continue;
    credit -= 1;
    const size = briefTokens(line) + 1;
    if (used + size > budget) {
      const room = budget - used;
      if (room > 120) kept.push(headTail(line, room));
      break;
    }
    kept.push(line);
    used += size;
  }
  return kept;
}

/**
 * Renders sections within a token budget. When the evidence is larger than
 * the budget each section keeps a proportional share, sampled evenly, and
 * says how much it left out so the child can look the rest up.
 */
export function fitBriefSections(
  sections: readonly BriefSection[],
  budget: number
): string {
  const sizes = sections.map(
    ({ title, lines }) =>
      briefTokens(title) +
      lines.reduce((sum, line) => sum + briefTokens(line) + 1, 0)
  );
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const rendered = sections.map((section, index) => {
    if (total <= budget || !section.lines.length)
      return [section.title, ...section.lines].join("\n");
    const share = Math.max(200, Math.floor((budget * sizes[index]!) / total));
    if (section.prose)
      return `${section.title}\n${headTail(section.lines.join("\n"), share)}`;
    const kept = sampleLines(section.lines, share);
    return [
      section.title,
      ...kept,
      `〔本节证据较多，已按章节均匀保留 ${kept.length}/${section.lines.length} 条；需要细节请用检索工具按章号或关键词补查。〕`
    ].join("\n");
  });
  return rendered.join("\n\n");
}

/** Chapter summaries, plot events and foreshadowing beats of some cards. */
export function chapterDigestSections(
  cards: DecompositionReadingCard[],
  title: string
): BriefSection[] {
  return [
    {
      title,
      lines: cards.flatMap((card) =>
        card.chapters.map((chapter) =>
          [
            `### 第${chapter.order}章 ${chapter.title}`,
            `梗概：${chapter.summary}`,
            chapter.events.length ? `事件：${chapter.events.join("；")}` : "",
            chapter.scene ? `场景：${chapter.scene}` : "",
            chapter.hook ? `钩子：${chapter.hook}` : ""
          ]
            .filter(Boolean)
            .join("\n")
        )
      )
    },
    {
      title: "【剧情事件】",
      lines: cards.flatMap((card) =>
        card.plot.events.map(
          (event) =>
            `${factLine(event)}${event.cause ? `（起因：${event.cause}）` : ""}`
        )
      )
    },
    {
      title: "【伏笔动作】",
      lines: cards.flatMap((card) =>
        card.plot.foreshadowing.map(
          (beat) => `［${beat.label}／${beat.action}］${factLine(beat)}`
        )
      )
    }
  ];
}
