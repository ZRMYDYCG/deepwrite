import {
  decompositionReadingUnitId,
  type DecompositionSubmissionData,
  type LongBookAnalysisSource,
  type LongBookDecompositionJob
} from "@deepwrite/contracts";
import { locateDecompositionExcerpt } from "./excerpt-match";

type ReadingData = Extract<DecompositionSubmissionData, { kind: "reading" }>;
/** Schema ceiling of one stored excerpt, reading or style asset alike. */
const EXCERPT_MAX_CHARACTERS = 300;

function verbatim(where: string, source: string, excerpt: string): string {
  const exact = locateDecompositionExcerpt(source, excerpt);
  const quoted = excerpt.length > 24 ? `${excerpt.slice(0, 24)}…` : excerpt;
  if (exact === null)
    throw new Error(
      `${where}“${quoted}”不在指定章节原文中；须从同一段落逐字复制，不要改写、拼接或省略中间文字。`
    );
  if (exact.length > EXCERPT_MAX_CHARACTERS)
    throw new Error(
      `${where}“${quoted}”还原为原文后超过 ${EXCERPT_MAX_CHARACTERS} 字，请缩短到同一段落内。`
    );
  return exact;
}

/**
 * A reading unit names its chapter, so the fields that only echo it (block
 * id, title, segment index) come from the source rather than the model.
 */
function canonicalReading(
  job: LongBookDecompositionJob,
  unitId: string,
  data: ReadingData,
  source: LongBookAnalysisSource
): ReadingData {
  const chunk = job.chunks.find((chunk) =>
    chunk.chapterIds.some(
      (id) => decompositionReadingUnitId(chunk, id) === unitId
    )
  );
  const chapterId = chunk?.chapterIds.find(
    (id) => decompositionReadingUnitId(chunk, id) === unitId
  );
  const chapter = source.chapters.find(({ id }) => id === chapterId);
  const submitted = data.card.chapters[0];
  // Anything else is reported by the submission check that follows.
  if (!chunk || !chapter || !submitted || data.card.chapters.length !== 1)
    return data;
  if (submitted.chapterId !== chapter.id || submitted.order !== chapter.order)
    throw new Error(
      `${unitId} 是第 ${chapter.order} 章“${chapter.title}”（chapterId=${chapter.id}，order=${chapter.order}），收到 chapterId=${submitted.chapterId}、order=${submitted.order}。`
    );
  const text = chunk.segment
    ? chapter.text.slice(chunk.segment.start, chunk.segment.end)
    : chapter.text;
  const { segmentIndex: _echoed, ...reading } = submitted;
  return {
    kind: "reading",
    card: {
      ...data.card,
      chunkId: chunk.id,
      chapters: [
        {
          ...reading,
          title: chapter.title,
          ...(chunk.segment ? { segmentIndex: chunk.segment.index } : {})
        }
      ],
      style: {
        ...data.card.style,
        excerpts: data.card.style.excerpts.map((excerpt, index) => ({
          ...excerpt,
          text: verbatim(`style.excerpts.${index} `, text, excerpt.text)
        }))
      }
    }
  };
}

/**
 * Checks a submission against the confirmed source and returns it with what
 * the source decides: a reading card's chapter identity and the exact source
 * span of every excerpt.
 */
export function canonicalDecompositionEvidence(
  job: LongBookDecompositionJob,
  unitId: string,
  data: DecompositionSubmissionData,
  source: LongBookAnalysisSource
): DecompositionSubmissionData {
  const chapterAt = (order: number) =>
    source.chapters.find((chapter) => chapter.order === order);
  if (data.kind === "reading")
    return canonicalReading(job, unitId, data, source);
  if (data.kind !== "asset" && data.kind !== "asset-part") return data;
  const asset = data.asset;
  if (asset.kind === "style")
    return {
      kind: "asset",
      asset: {
        ...asset,
        excerpts: asset.excerpts.map((excerpt, index) => ({
          ...excerpt,
          text: verbatim(
            `excerpts.${index} `,
            chapterAt(excerpt.chapterOrder)?.text ?? "",
            excerpt.text
          )
        }))
      }
    };
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
  return data;
}
