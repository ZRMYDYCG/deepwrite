import { createScopedTranslator } from "../i18n";
import type { LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";

const t = createScopedTranslator("workspace.longDeletionImpact");

export type LongDeletionTargetKind =
  "character" | "volume" | "plotPoint" | "chapterCard";

function uniqueCount(values: readonly string[]): number {
  return new Set(values).size;
}

function chapterFileCount(
  index: LongWorkspaceIndexSnapshot,
  chapterCardIds: ReadonlySet<string>
): number {
  return index.chapters
    .filter(({ chapterCardId }) => chapterCardIds.has(chapterCardId))
    .reduce(
      (count, chapter) =>
        count +
        5 +
        (chapter.worldReveals ? 1 : 0) +
        chapter.characterContinuity.length * 2,
      0
    );
}

export function longDeletionImpactLines(
  index: LongWorkspaceIndexSnapshot,
  kind: LongDeletionTargetKind,
  id: string
): string[] {
  if (kind === "character") {
    const eventReferences = index.plot.storyEvents.filter((event) =>
      event.characterIds.includes(id)
    ).length;
    const continuityReferences = index.chapters.filter((chapter) =>
      chapter.characterContinuity.some(({ characterId }) => characterId === id)
    ).length;
    return [
      t("deleteThisCharacterSCoreProfileAndRelationshipFiles"),
      eventReferences
        ? t("unlinkCharacterReferencesFromStoryEventsKeepTheEvents", {
            eventReferences: eventReferences
          })
        : "",
      continuityReferences
        ? t("deleteCharacterContinuityMappingsAndFilesFromChaptersKeep", {
            continuityReferences: continuityReferences
          })
        : ""
    ].filter(Boolean);
  }

  if (kind === "volume") {
    const arcIds = new Set(
      index.plot.arcs
        .filter(({ volumeId }) => volumeId === id)
        .map(({ id }) => id)
    );
    const chapterIds = new Set(
      index.plot.chapterCards
        .filter(({ volumeId }) => volumeId === id)
        .map(({ id }) => id)
    );
    const storyPlotIds = index.plot.storyPlots
      .filter(({ arcId }) => arcIds.has(arcId))
      .map(({ id }) => id);
    const placementIds = new Set(
      index.plot.narrativePlacements
        .filter(({ chapterCardId }) => chapterIds.has(chapterCardId))
        .map(({ id }) => id)
    );
    const beatIds = index.plot.foreshadowing.flatMap(({ beats }) =>
      beats
        .filter(
          ({ volumeId, arcId, chapterCardId, placementId }) =>
            volumeId === id ||
            (typeof arcId === "string" && arcIds.has(arcId)) ||
            (typeof chapterCardId === "string" &&
              chapterIds.has(chapterCardId)) ||
            (typeof placementId === "string" && placementIds.has(placementId))
        )
        .map(({ id }) => id)
    );
    const eventReferences = index.plot.storyEvents.filter((event) =>
      event.arcIds.some((arcId) => arcIds.has(arcId))
    ).length;
    const ledgerRecords = index.ledger.commits.filter((commit) =>
      (commit.chapterCardIds ?? [commit.chapterCardId]).some((chapterCardId) =>
        chapterIds.has(chapterCardId)
      )
    ).length;
    return [
      arcIds.size
        ? t("deleteChildPlotPoints", {
            size: arcIds.size
          })
        : "",
      chapterIds.size
        ? t("deleteChildChapterCards", {
            size: chapterIds.size
          })
        : "",
      storyPlotIds.length
        ? t("deleteChildStorylinesAndTheirContent", {
            length: storyPlotIds.length
          })
        : "",
      placementIds.size
        ? t("deleteChildNarrativeAnchors", {
            size: placementIds.size
          })
        : "",
      uniqueCount(beatIds)
        ? t("unlinkVolumePlotPointChapterCardOrAnchorReferences", {
            value: uniqueCount(beatIds)
          })
        : "",
      chapterIds.size
        ? t("deleteChapterCardManuscriptAndContinuityFiles", {
            value: chapterFileCount(index, chapterIds)
          })
        : "",
      ledgerRecords
        ? t("updateContinuityRecordsAndUnlinkRelatedDecisions", {
            ledgerRecords: ledgerRecords
          })
        : "",
      eventReferences
        ? t("unlinkPlotPointReferencesFromStoryEventsKeepThe", {
            eventReferences: eventReferences
          })
        : ""
    ].filter(Boolean);
  }

  if (kind === "plotPoint") {
    const storyPlots = index.plot.storyPlots.filter(
      ({ arcId }) => arcId === id
    ).length;
    const eventReferences = index.plot.storyEvents.filter((event) =>
      event.arcIds.includes(id)
    ).length;
    const chapterReferences = index.plot.chapterCards.filter(
      ({ primaryArcId }) => primaryArcId === id
    ).length;
    const beats = index.plot.foreshadowing.flatMap(({ beats }) =>
      beats.filter(({ arcId }) => arcId === id)
    ).length;
    return [
      storyPlots
        ? t("deleteChildStorylinesAndTheirContent2", { storyPlots: storyPlots })
        : "",
      beats
        ? t("unlinkPlotPointReferencesFromForeshadowingBeatsKeepThreads", {
            beats: beats
          })
        : "",
      eventReferences
        ? t("unlinkPlotPointReferencesFromStoryEventsKeepThe", {
            eventReferences: eventReferences
          })
        : "",
      chapterReferences
        ? t("unlinkMainPlotPointReferencesFromChapterCardsKeep", {
            chapterReferences: chapterReferences
          })
        : ""
    ].filter(Boolean);
  }

  const chapterIds = new Set([id]);
  const placements = index.plot.narrativePlacements.filter(
    ({ chapterCardId }) => chapterCardId === id
  );
  const placementIds = new Set(placements.map(({ id }) => id));
  const beats = index.plot.foreshadowing.flatMap(({ beats }) =>
    beats.filter(
      ({ chapterCardId, placementId }) =>
        chapterCardId === id ||
        (typeof placementId === "string" && placementIds.has(placementId))
    )
  ).length;
  const ledgerRecords = index.ledger.commits.filter(
    ({ chapterCardId }) => chapterCardId === id
  ).length;
  return [
    t("deleteChapterCardManuscriptAndContinuityFiles", {
      value: chapterFileCount(index, chapterIds)
    }),
    placements.length
      ? t("deleteChildNarrativeAnchors2", {
          length: placements.length
        })
      : "",
    beats
      ? t("unlinkChapterCardOrAnchorReferencesFromForeshadowingBeats", {
          beats: beats
        })
      : "",
    ledgerRecords
      ? t("updateContinuityRecordsAndUnlinkRelatedDecisions", {
          ledgerRecords: ledgerRecords
        })
      : "",
    placements.length
      ? t("storyEventsLinkedToNarrativeAnchorsWillBePreserved")
      : ""
  ].filter(Boolean);
}

export function longDeletionDescription(
  index: LongWorkspaceIndexSnapshot,
  kind: LongDeletionTargetKind,
  id: string
): string {
  const impacts = longDeletionImpactLines(index, kind, id);
  return impacts.length
    ? t("deletingThisItemAlsoAffectsTheseRelatedRecords", {
        join: impacts.join("；")
      })
    : t("thisItemHasNoRelatedRecordsAndWillBe");
}
