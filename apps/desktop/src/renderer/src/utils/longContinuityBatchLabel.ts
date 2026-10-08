import { createScopedTranslator } from "../i18n";
import type {
  LongBookSummary,
  LongLedgerCommitIndexEntry
} from "@deepwrite/contracts";

const t = createScopedTranslator("workspace");

export function longContinuityBatchLabel(
  commit: LongLedgerCommitIndexEntry,
  chapterCards: LongBookSummary["navigation"]["chapterCards"],
  titleById: ReadonlyMap<string, string> = new Map(
    chapterCards.map(({ id, title }) => [id, title])
  )
): { label: string; badge: string } {
  const chapterCardIds = commit.chapterCardIds ?? [commit.chapterCardId];
  const firstId = chapterCardIds[0]!;
  const lastId = chapterCardIds.at(-1)!;
  const firstTitle = titleById.get(firstId) ?? firstId;
  const lastTitle = titleById.get(lastId) ?? lastId;
  const label =
    chapterCardIds.length === 1 ? lastTitle : `${firstTitle} — ${lastTitle}`;
  const badge =
    commit.mode === "import_checkpoint"
      ? t("longWorkspaceContinuityTree.importedCheckpoint")
      : chapterCardIds.length === 1
        ? t("longContinuityBatchLabel.record", {
            sequence: commit.sequence
          })
        : t("longContinuityBatchLabel.chaptersRecord", {
            length: chapterCardIds.length,
            sequence: commit.sequence
          });
  return { label, badge };
}
