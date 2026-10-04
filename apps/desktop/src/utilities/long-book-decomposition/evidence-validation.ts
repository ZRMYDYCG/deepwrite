import {
  decompositionReadingUnitId,
  type DecompositionSubmissionData,
  type LongBookAnalysisSource,
  type LongBookDecompositionJob
} from "@deepwrite/contracts";

export function assertDecompositionSourceEvidence(
  job: LongBookDecompositionJob,
  unitId: string,
  data: DecompositionSubmissionData,
  source: LongBookAnalysisSource
) {
  const chapterAt = (order: number) =>
    source.chapters.find((chapter) => chapter.order === order);
  const assertExcerpt = (order: number, text: string) => {
    if (!chapterAt(order)?.text.includes(text))
      throw new Error("引用片段必须逐字来自指定的来源章节。");
  };
  if (data.kind === "reading") {
    const submitted = data.card.chapters[0]!;
    const chapter = chapterAt(submitted.order);
    const chunk = job.chunks.find(({ id }) => id === data.card.chunkId)!;
    if (
      chapter?.id !== submitted.chapterId ||
      chapter.title !== submitted.title
    )
      throw new Error("阅读卡的章节身份、章号或标题与确认来源不一致。");
    const text = chunk.segment
      ? chapter.text.slice(chunk.segment.start, chunk.segment.end)
      : chapter.text;
    if (
      data.card.style.excerpts.some((excerpt) => !text.includes(excerpt.text))
    )
      throw new Error("阅读片段中的摘录必须来自当前片段。");
  }
  if (data.kind !== "asset") return;
  const asset = data.asset;
  if (asset.kind === "style")
    asset.excerpts.forEach(({ chapterOrder, text }) =>
      assertExcerpt(chapterOrder, text)
    );
  if (asset.kind === "chronicle") {
    const segment = job.chronicleSegments.find(({ id }) => id === unitId);
    const chunks = job.chunks.filter(({ id }) =>
      segment?.chunkIds.includes(id)
    );
    if (
      !chunks.length ||
      asset.points.some(
        ({ startOrder, endOrder }) =>
          startOrder > endOrder ||
          startOrder < chunks[0]!.startOrder ||
          endOrder > chunks.at(-1)!.endOrder
      )
    )
      throw new Error("编年段的剧情点范围超出分配的阅读块。");
  }
  if (asset.kind === "foreshadowing") {
    for (const beat of asset.lines.flatMap(({ beats }) => beats)) {
      const chapter = chapterAt(beat.chapterOrder);
      const chunks = job.chunks.filter(
        ({ chapterIds }) => chapter && chapterIds.includes(chapter.id)
      );
      if (
        !chapter ||
        !chunks.length ||
        chunks.some(
          (chunk) =>
            job.units[decompositionReadingUnitId(chunk, chapter.id)]?.status !==
            "done"
        )
      )
        throw new Error("伏笔触点必须来自完整持久化通读的章节。");
    }
  }
}
