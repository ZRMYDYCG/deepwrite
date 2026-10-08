import {
  createLongWorkspaceNavigationSnapshot,
  type LongBookSummary
} from "@deepwrite/contracts";
import { fixture } from "../types/longWorkspace.test-support";

/** Synthetic imported chapters; no user data or filesystem is involved. */
export function longWorkspaceScaleFixture(count: number) {
  const { summary, workspaceIndex: index } = fixture(null);
  index.schemaVersion = 1;
  index.bookId = summary.id;
  index.updatedAt = "2026-10-06T00:00:00.000Z";
  index.featureSettings = {
    worldbuildingItemLayout: "top-tabs",
    characterAndContinuityItemLayout: "top-tabs",
    plotItemLayout: "top-tabs"
  };
  index.worldbuilding = [];
  index.characters = [];
  index.characterTypes = [];
  index.characterFiles = [];
  index.plot.storyEvents = [];
  index.plot.storyPlots = [];
  index.plot.eventConnections = [];
  index.plot.narrativePlacements = [];
  index.plot.foreshadowing = [];
  index.ledger.committedThroughChapterId = null;
  const template = index.chapters[0]!;
  index.plot.chapterCards = Array.from({ length: count }, (_, i) => ({
    id: `chapter_${i + 1}`,
    volumeId: "volume_one",
    title: `第 ${i + 1} 章`,
    primaryArcId: "arc_one",
    narrativeOrder: i + 1
  }));
  index.chapters = index.plot.chapterCards.map((card) => ({
    ...template,
    chapterCardId: card.id,
    ...Object.fromEntries(
      ["body", "card", "characterState", "handoff", "foreshadowingChanges"].map(
        (role) => [
          role,
          {
            id: `file_${card.id}_${role}`,
            path: `long/chapters/${card.id}/${role}.md`,
            updatedAt: index.updatedAt
          }
        ]
      )
    )
  }));
  return {
    index,
    book: {
      ...summary,
      updatedAt: index.updatedAt,
      navigation: createLongWorkspaceNavigationSnapshot(index)
    } as LongBookSummary
  };
}
