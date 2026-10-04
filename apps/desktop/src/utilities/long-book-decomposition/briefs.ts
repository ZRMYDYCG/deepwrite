import {
  decompositionAssetProse,
  decompositionChaptersPerSubmission,
  decompositionReadingUnitId,
  type DecompositionAsset,
  type DecompositionReadingCard,
  type DecompositionRecord,
  type DecompositionRegistry,
  type LongBookAnalysisChapter,
  type LongBookDecompositionJob
} from "@deepwrite/contracts";
import { characterBriefs, domainBriefs } from "./brief-assets";
import {
  chapterDigestSections,
  factLine,
  fitBriefSections,
  type BriefSection
} from "./brief-text";
import {
  readDecompositionCards,
  readDecompositionRegistry
} from "./query-records";
import type { DecompositionRecordsReader } from "./records-reader";
import { decompositionMentions, emptyDecompositionRegistry } from "./workflow";

export interface BriefContext {
  job: LongBookDecompositionJob;
  chapters: LongBookAnalysisChapter[];
  cards(): Promise<DecompositionReadingCard[]>;
  registry(): Promise<DecompositionRegistry>;
  record(unitId: string): Promise<DecompositionRecord>;
  /** The saved asset of a finished unit, from its task record. */
  asset(unitId: string): Promise<DecompositionAsset | undefined>;
  /** Review issues that sent a finished unit back for repair. */
  repairs(unitId: string): Promise<string[]>;
}

export function briefContext(
  job: LongBookDecompositionJob,
  reader: DecompositionRecordsReader,
  chapters: LongBookAnalysisChapter[]
): BriefContext {
  let cards: Promise<DecompositionReadingCard[]> | undefined;
  const record = (unitId: string) => reader.record(job, unitId);
  const asset = async (unitId: string) => {
    if (job.units[unitId]?.status !== "done") return undefined;
    const saved = await record(unitId);
    return saved.data.kind === "asset" ? saved.data.asset : undefined;
  };
  return {
    job,
    chapters,
    cards: () =>
      (cards ??= readDecompositionCards(job, reader).then((list) =>
        [...list].sort(
          (a, b) => (a.chapters[0]?.order ?? 0) - (b.chapters[0]?.order ?? 0)
        )
      )),
    registry: async () =>
      job.units["registry:merge"]?.status === "done"
        ? readDecompositionRegistry(job, reader)
        : emptyDecompositionRegistry(),
    record,
    asset,
    repairs: async (unitId) => {
      const lines: string[] = [];
      for (const id of Object.keys(job.units))
        if (id.startsWith("review:") && job.units[id]!.status === "done") {
          const saved = await record(id);
          if (saved.data.kind !== "review") continue;
          for (const issue of saved.data.review.issues)
            if (issue.unitId === unitId && issue.resolution === "repair")
              lines.push(
                `${issue.description}（证据：${issue.chapterOrders.map((order) => `第${order}章`).join("、") || "无"}；建议：${issue.suggestion}）`
              );
        }
      return lines;
    }
  };
}

function readerBrief(context: BriefContext, unitId: string): string {
  const { job, chapters } = context;
  const chunk = job.chunks.find(({ id }) => id === unitId);
  if (!chunk) throw new Error("阅读块不存在。");
  const saved: string[] = [];
  const parts: string[] = [];
  for (const chapterId of chunk.chapterIds) {
    const chapter = chapters.find(({ id }) => id === chapterId);
    if (!chapter) throw new Error("阅读块章节不在来源范围内。");
    const readingId = decompositionReadingUnitId(chunk, chapterId);
    const label = `第 ${chapter.order} 章 ${chapter.title}${chunk.segment ? `（片段 ${chunk.segment.index + 1}/${chunk.segment.count}，segmentIndex=${chunk.segment.index}）` : ""}`;
    if (job.units[readingId]?.status === "done") {
      saved.push(`${readingId}（${label}）`);
      continue;
    }
    const text = chunk.segment
      ? chapter.text.slice(chunk.segment.start, chunk.segment.end)
      : chapter.text;
    parts.push(
      `### ${readingId}｜chapterId=${chapter.id}｜order=${chapter.order}｜${label}\n${text}`
    );
  }
  // Source text is never trimmed: the chunk plan already sized it.
  return [
    `【阅读块 ${chunk.id}】第 ${chunk.startOrder}–${chunk.endOrder} 章${chunk.volume ? `，${chunk.volume}` : ""}。每次提交建议不超过 ${decompositionChaptersPerSubmission(job.models.reading)} 章。`,
    saved.length ? `已保存，无需再交：${saved.join("、")}` : "",
    ...parts
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function registryBrief(context: BriefContext, unitId: string) {
  if (unitId === "registry:merge") {
    // Part registries stay structured: the merge keeps or rewrites their ids.
    const parts = { characters: [] as unknown[], terms: [] as unknown[] };
    for (const id of context.job.units[unitId]!.dependencies) {
      const saved = await context.record(id);
      if (saved.data.kind !== "registry") continue;
      parts.characters.push(...saved.data.registry.characters);
      parts.terms.push(...saved.data.registry.terms);
    }
    return {
      title: "【名册分片】合并为完整名册，每个名字都要归属或标记忽略。",
      lines: [JSON.stringify(parts)]
    };
  }
  const cards = await context.cards();
  const mentions = decompositionMentions(cards);
  const part = Math.max(0, Number(unitId.split(":").at(-1) ?? 1) - 1);
  const sample = (facts: unknown[]) =>
    [facts[0], facts[Math.floor(facts.length / 2)], facts.at(-1)]
      .filter((fact, index, all) => fact && all.indexOf(fact) === index)
      .map((fact) =>
        factLine(fact as { chapterOrder: number; text: string }).slice(0, 90)
      )
      .join("；");
  const lines = [
    ...mentions.characters.map(
      (entry) =>
        `人物｜${entry.name}｜别名：${entry.aliases.join("、") || "无"}｜首次第${entry.firstChapterOrder}章｜出现于 ${entry.chunkCount} 块｜${sample(entry.facts)}`
    ),
    ...mentions.terms.map(
      (entry) =>
        `设定｜${entry.categoryId}｜${entry.name}｜别名：${entry.aliases.join("、") || "无"}｜提及 ${entry.mentionCount} 次｜${sample(entry.facts)}`
    )
  ].slice(part * 1000, (part + 1) * 1000);
  return { title: `【${unitId} 名字提及】`, lines };
}

async function chronicleBrief(context: BriefContext, unitId: string) {
  const segment = context.job.chronicleSegments.find(({ id }) => id === unitId);
  if (!segment) throw new Error("编年段不存在。");
  const cards = (await context.cards()).filter(({ chunkId }) =>
    segment.chunkIds.includes(chunkId)
  );
  return chapterDigestSections(cards, `【${unitId} 阅读记录摘要】`);
}

async function plotBrief(context: BriefContext, unitId: string) {
  const segments = context.job.chronicleSegments;
  const sections: BriefSection[] = [];
  for (const { id, volume } of unitId === "plot:opening"
    ? segments.slice(0, 2)
    : segments) {
    const asset = await context.asset(id);
    if (asset)
      sections.push({
        title: `【${id} 编年${volume ? `｜${volume}` : ""}】`,
        lines: [
          unitId === "plot:foreshadowing" && asset.kind === "chronicle"
            ? asset.summary
            : decompositionAssetProse(asset)
        ],
        prose: true
      });
  }
  if (unitId === "plot:foreshadowing")
    sections.push(chapterDigestSections(await context.cards(), "")[2]!);
  if (unitId === "plot:opening")
    sections.push({
      title: "【开篇原文】",
      lines: context.chapters
        .slice(0, 3)
        .map(({ order, title, text }) => `### 第${order}章 ${title}\n${text}`),
      prose: true
    });
  return sections;
}

/**
 * Assembles everything one child needs for its units, within the evidence
 * budget, so the child reads it once instead of paging through lookups.
 */
export async function buildDecompositionBrief(
  context: BriefContext,
  unitIds: readonly string[],
  budget: number
): Promise<string> {
  for (const id of unitIds)
    if (!context.job.units[id]) throw new Error(`未知单元：${id}`);
  if (unitIds.some((id) => id.startsWith("chunk:"))) {
    if (unitIds.length !== 1)
      throw new Error("每个通读子任务只能处理一个阅读块。");
    return readerBrief(context, unitIds[0]!);
  }
  const sections: BriefSection[] = [];
  for (const id of unitIds) {
    if (id.startsWith("registry:"))
      sections.push(await registryBrief(context, id));
    else if (id.startsWith("chronicle:"))
      sections.push(...(await chronicleBrief(context, id)));
    else if (id.startsWith("plot:"))
      sections.push(...(await plotBrief(context, id)));
    else if (id.startsWith("character"))
      sections.push(...(await characterBriefs(context, id)));
    else sections.push(...(await domainBriefs(context, id)));
    const repairs = await context.repairs(id);
    if (repairs.length)
      sections.push({ title: `【${id} 审校要求修复】`, lines: repairs });
  }
  return fitBriefSections(
    sections.filter(({ lines }) => lines.length),
    budget
  );
}
