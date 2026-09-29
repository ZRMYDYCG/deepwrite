import { createScopedTranslator } from "../i18n";

import type {
  LongBookSummary,
  LongWorkspaceIndexSnapshot,
  LongChapterCardId
} from "@deepwrite/contracts";
import type {
  LongWorkspaceSelection,
  LongWorkspaceSelectionFile
} from "./longWorkspace";
import { indexedVolume, indexedChapterCard } from "./longIndexedChapter";

const t = createScopedTranslator("workspace.selection");

/**
 * Keeps chapter authoring and continuity review as two distinct entry points.
 * Evidence stays read-only; continuity outputs are editable until committed;
 * the internal commit JSON is never part of the visible selection.
 */
export function createLongContinuitySelection(
  summary: LongBookSummary,
  workspaceIndex: LongWorkspaceIndexSnapshot,
  chapterCardId: LongChapterCardId
): LongWorkspaceSelection | undefined {
  const chapter = indexedChapterCard(summary, workspaceIndex, chapterCardId);
  const volume = chapter
    ? indexedVolume(summary, workspaceIndex, chapter.volumeId)
    : undefined;
  const entry = workspaceIndex.chapters.find(
    (candidate) => candidate.chapterCardId === chapterCardId
  );
  if (!chapter || !volume || !entry) {
    return undefined;
  }
  const committed = entry.commitId !== null;
  const commit = committed
    ? workspaceIndex.ledger.commits.find(({ id }) => id === entry.commitId)
    : undefined;
  const importCheckpoint = commit?.mode === "import_checkpoint";
  if (!committed && entry.bodyStatus !== "written") {
    return undefined;
  }
  const characterNameById = new Map(
    summary.navigation.characters.map(({ id, name }) => [id, name] as const)
  );
  const characterContinuityFiles = [...(entry.characterContinuity ?? [])]
    .sort((left, right) =>
      (
        characterNameById.get(left.characterId) ?? left.characterId
      ).localeCompare(
        characterNameById.get(right.characterId) ?? right.characterId,
        "zh-CN"
      )
    )
    .flatMap<LongWorkspaceSelectionFile>((character) => {
      const name =
        characterNameById.get(character.characterId) ?? character.characterId;
      return [
        {
          role: "current-state",
          get label() {
            return t("namedCurrentState", { name: name });
          },
          file: character.currentState,
          readOnly: committed
        },
        {
          role: "history",
          get label() {
            return t("namedHistory", { name: name });
          },
          file: character.history,
          readOnly: committed
        }
      ];
    });
  return {
    key: `continuity:${chapter.id}`,
    root: "continuity_ledger",
    continuityView: committed ? "history" : "inbox",
    chapterCardId: chapter.id,
    title: chapter.title || chapter.id,
    get breadcrumbs() {
      return [
        summary.title,
        t("continuityLedger"),
        volume.title,
        chapter.title || chapter.id
      ];
    },
    files: [
      {
        role: "body",
        get label() {
          return t("manuscriptEvidence");
        },
        file: entry.body,
        readOnly: true
      },
      ...(importCheckpoint ? [] : characterContinuityFiles),
      ...(entry.worldReveals && !importCheckpoint
        ? [
            {
              role: "world-reveals" as const,
              get label() {
                return t("worldRevelations");
              },
              file: entry.worldReveals,
              readOnly: committed
            }
          ]
        : []),
      ...(!importCheckpoint
        ? [
            {
              role: "foreshadowing-changes" as const,
              get label() {
                return t("foreshadowingChanges");
              },
              file: entry.foreshadowingChanges,
              readOnly: committed
            }
          ]
        : []),
      ...(importCheckpoint
        ? []
        : [
            {
              role: "character-state" as const,
              get label() {
                return t("chapterEndState");
              },
              file: entry.characterState,
              readOnly: committed
            },
            {
              role: "handoff" as const,
              get label() {
                return t("handoff");
              },
              file: entry.handoff,
              readOnly: committed
            }
          ])
    ],
    preferredRole: "body",
    get description() {
      return importCheckpoint
        ? t("checkpointHelp")
        : committed
          ? t("chapterContinuityHelp")
          : t("pendingContinuityHelp");
    }
  };
}
