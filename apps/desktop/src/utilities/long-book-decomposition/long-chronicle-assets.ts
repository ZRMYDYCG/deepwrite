import {
  longStoryPlotBodyFileId,
  longStoryPlotFilePath,
  type DecompositionAsset,
  type LongBookDecompositionJob,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import { decompositionResourceId } from "./identity";
import type { NativeAssetWriter } from "./long-native-assets";

type Chronicle = Extract<DecompositionAsset, { kind: "chronicle" }>;
type ChapterCard = LongWorkspaceIndexSnapshot["plot"]["chapterCards"][number];
const LAST = Number.MAX_SAFE_INTEGER;

const storyPlotId = (job: LongBookDecompositionJob, arcId: string) =>
  decompositionResourceId("storyplot", job.id, arcId);

/**
 * Arcs this unit created before: the creator also wrote the arc's story plot,
 * while a unit that only renumbered an arc did not.
 */
function ownArcIds(
  job: LongBookDecompositionJob,
  index: LongWorkspaceIndexSnapshot,
  unitId: string
): Set<string> {
  const refs = new Set(
    job.units[unitId]?.outputRefs.map(({ resourceId }) => resourceId)
  );
  return new Set(
    index.plot.arcs
      .filter(({ id }) => refs.has(id) && refs.has(storyPlotId(job, id)))
      .map(({ id }) => id)
  );
}

/**
 * Beats anchored to a chapter whose arc moved would fail the index check
 * against their old planning arc; the chapter now decides their arc.
 */
function releaseMovedBeats(
  index: LongWorkspaceIndexSnapshot,
  moved: ReadonlySet<string>,
  touched: Set<string>
) {
  const placements = new Map(
    index.plot.narrativePlacements.map(({ id, chapterCardId }) => [
      id,
      chapterCardId
    ])
  );
  const chapters = new Map(
    index.plot.chapterCards.map((card) => [card.id, card])
  );
  for (const thread of index.plot.foreshadowing)
    for (const beat of thread.beats) {
      const chapterId =
        beat.chapterCardId ??
        (beat.placementId ? placements.get(beat.placementId) : undefined);
      if (!beat.arcId || !chapterId || !moved.has(chapterId)) continue;
      if (beat.arcId === chapters.get(chapterId)?.primaryArcId) continue;
      beat.arcId = null;
      touched.add(thread.id);
    }
}

/** Nothing but the arc's own story plot may still point at it. */
function arcInUse(
  job: LongBookDecompositionJob,
  index: LongWorkspaceIndexSnapshot,
  unitId: string,
  arcId: string
): boolean {
  const { plot } = index;
  return (
    plot.chapterCards.some(({ primaryArcId }) => primaryArcId === arcId) ||
    plot.storyEvents.some(({ arcIds }) => arcIds.includes(arcId)) ||
    plot.foreshadowing.some(({ beats }) =>
      beats.some((beat) => beat.arcId === arcId)
    ) ||
    plot.storyPlots.some(
      (story) => story.arcId === arcId && story.id !== storyPlotId(job, arcId)
    ) ||
    // Another unit's saved receipt still checks this arc's content.
    Object.entries(job.units).some(
      ([id, unit]) =>
        id !== unitId &&
        unit.outputRefs.some(({ resourceId }) => resourceId === arcId)
    )
  );
}

/** Orders a volume's arcs by the first chapter each one covers. */
function renumberArcs(
  index: LongWorkspaceIndexSnapshot,
  volumeId: string,
  positions: ReadonlyMap<string, number>,
  touched: Set<string>
) {
  const first = new Map<string, number>();
  for (const card of index.plot.chapterCards)
    if (card.volumeId === volumeId && card.primaryArcId)
      first.set(
        card.primaryArcId,
        Math.min(first.get(card.primaryArcId) ?? LAST, card.narrativeOrder)
      );
  index.plot.arcs
    .filter((arc) => arc.volumeId === volumeId)
    .map((arc) => ({
      arc,
      key: first.get(arc.id) ?? positions.get(arc.id) ?? LAST
    }))
    .sort((a, b) => a.key - b.key || a.arc.order - b.arc.order)
    .forEach(({ arc }, number) => {
      if (arc.order === number + 1) return;
      arc.order = number + 1;
      touched.add(arc.id);
    });
}

/**
 * Writes the chronicle's points as the arcs of the chapters they cover. An
 * arc's id comes from its chapter range, so a rewrite keeps the arcs whose
 * range stayed; arcs it no longer needs are removed, their uncovered chapters
 * return to the volume's source arc, and beats on moved chapters follow them.
 */
export async function applyChronicle(
  job: LongBookDecompositionJob,
  index: LongWorkspaceIndexSnapshot,
  asset: Chronicle,
  writer: NativeAssetWriter,
  unitId: string
): Promise<void> {
  const now = new Date().toISOString();
  const start = job.source.range.start;
  const own = ownArcIds(job, index, unitId);
  const previous = new Map(
    index.plot.chapterCards.map((card) => [card.id, card.primaryArcId])
  );
  const created = new Map<string, number>();
  const ranges = new Map<string, number>();
  const touched = new Set<string>();
  const volumes = new Set<string>();
  for (const point of asset.points) {
    if (point.startOrder > point.endOrder)
      throw new Error("剧情点章节范围无效。");
    const cards = index.plot.chapterCards.filter(
      (_, i) => i + start >= point.startOrder && i + start <= point.endOrder
    );
    if (!cards.length) throw new Error("剧情点不在已读章节中。");
    for (const volumeId of new Set(cards.map(({ volumeId }) => volumeId))) {
      const covered = cards.filter((card) => card.volumeId === volumeId);
      const range = `${unitId}:${point.startOrder}-${point.endOrder}:${volumeId}`;
      const repeat = ranges.get(range) ?? 0;
      ranges.set(range, repeat + 1);
      const id = decompositionResourceId(
        "arc",
        job.id,
        repeat ? `${range}#${repeat}` : range
      );
      const arc = index.plot.arcs.find((item) => item.id === id);
      if (arc)
        Object.assign(arc, { title: point.title, summary: point.summary });
      // Renumbered below, once every arc of the volume is known.
      else
        index.plot.arcs.push({
          id,
          volumeId,
          title: point.title,
          summary: point.summary,
          outline: "",
          order: index.plot.arcs.length + 1
        });
      for (const card of covered) card.primaryArcId = id;
      created.set(id, Math.min(...covered.map((card) => card.narrativeOrder)));
      volumes.add(volumeId);
      touched.add(id);
      const storyId = storyPlotId(job, id);
      let story = index.plot.storyPlots.find((item) => item.id === storyId);
      if (story) story.title = point.title;
      else {
        story = {
          id: storyId,
          arcId: id,
          title: point.title,
          order: 1,
          file: {
            id: longStoryPlotBodyFileId(storyId),
            path: longStoryPlotFilePath(storyId),
            updatedAt: now
          }
        };
        index.plot.storyPlots.push(story);
      }
      await writer.file(story.file, point.summary);
      touched.add(storyId);
    }
  }
  const stale = (arcId: string | null) =>
    !!arcId && own.has(arcId) && !created.has(arcId);
  for (const card of index.plot.chapterCards.filter(({ primaryArcId }) =>
    stale(primaryArcId)
  ))
    card.primaryArcId = sourceArc(job, index, card);
  const moved = new Set(
    index.plot.chapterCards
      .filter((card) => previous.get(card.id) !== card.primaryArcId)
      .map(({ id }) => id)
  );
  releaseMovedBeats(index, moved, touched);
  for (const arc of index.plot.arcs.filter(({ id }) => stale(id))) {
    if (arcInUse(job, index, unitId, arc.id)) continue;
    const storyId = storyPlotId(job, arc.id);
    const story = index.plot.storyPlots.find(({ id }) => id === storyId);
    await writer.remove(arc.id);
    index.plot.arcs.splice(index.plot.arcs.indexOf(arc), 1);
    if (story) {
      await writer.remove(story.id, story.file);
      index.plot.storyPlots.splice(index.plot.storyPlots.indexOf(story), 1);
    }
    volumes.add(arc.volumeId);
  }
  for (const volumeId of volumes)
    renumberArcs(index, volumeId, created, touched);
  const objects = [
    ...index.plot.arcs,
    ...index.plot.storyPlots,
    ...index.plot.foreshadowing
  ];
  for (const object of objects)
    if (touched.has(object.id)) writer.object(object.id, object);
}

/** The arc a chapter had before any chronicle: its volume's source arc. */
function sourceArc(
  job: LongBookDecompositionJob,
  index: LongWorkspaceIndexSnapshot,
  card: ChapterCard
): string | null {
  const id = decompositionResourceId("arc", job.id, card.volumeId);
  return index.plot.arcs.some((arc) => arc.id === id) ? id : null;
}
