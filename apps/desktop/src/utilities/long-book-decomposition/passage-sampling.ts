import type {
  DecompositionQuery,
  DecompositionReadingCard,
  LongBookAnalysisChapter
} from "@deepwrite/contracts";

export function sampleDecompositionPassages(
  chapters: LongBookAnalysisChapter[],
  strategy: DecompositionQuery["strategy"],
  cards: DecompositionReadingCard[] = []
) {
  const spread = () =>
    chapters
      .filter(
        (_, index) => index % Math.max(1, Math.floor(chapters.length / 5)) === 0
      )
      .slice(0, 5);
  let selected =
    strategy === "ending"
      ? chapters.slice(-3)
      : strategy === "random"
        ? spread()
        : chapters.slice(0, 5);
  const offsets = new Map<string, number>();
  if (strategy === "dialogue") {
    selected = chapters
      .map((chapter) => {
        const matches = [...chapter.text.matchAll(/[“「『"]/gu)];
        offsets.set(chapter.id, Math.max(0, (matches[0]?.index ?? 0) - 120));
        return { chapter, score: matches.length };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.chapter.order - b.chapter.order)
      .slice(0, 5)
      .map(({ chapter }) => chapter);
    if (!selected.length) selected = spread();
  } else if (strategy === "climax") {
    const notes = new Map(
      cards.flatMap(({ chapters }) =>
        chapters.map(
          ({ order, summary, events }) =>
            [order, [summary, ...events].join(" ")] as const
        )
      )
    );
    selected = chapters
      .map((chapter) => {
        const keywords = /高潮|决战|决斗|揭晓|真相|逆转|生死|决胜|崩塌|终结/gu;
        const score =
          [...(notes.get(chapter.order) ?? "").matchAll(keywords)].length * 3 +
          [...chapter.text.matchAll(keywords)].length;
        const first = chapter.text.search(keywords);
        offsets.set(chapter.id, Math.max(0, first - 300));
        return { chapter, score };
      })
      .sort((a, b) => b.score - a.score || b.chapter.order - a.chapter.order)
      .slice(0, 5)
      .map(({ chapter }) => chapter);
  }
  return selected.map(({ order, title, id, text }) => ({
    chapterOrder: order,
    title,
    offset: offsets.get(id) ?? 0,
    text: text.slice(offsets.get(id) ?? 0, (offsets.get(id) ?? 0) + 1800)
  }));
}
