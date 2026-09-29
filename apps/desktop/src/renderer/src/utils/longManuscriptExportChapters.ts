import { t } from "../i18n";
import type { LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";

export interface LongManuscriptExportChapterOption {
  readonly id: string;
  readonly title: string;
  readonly volumeId: string;
  readonly volumeTitle: string;
  readonly volumeOrder: number;
  readonly narrativeOrder: number;
}

export interface LongManuscriptExportChapterGroup {
  readonly volumeId: string;
  readonly volumeTitle: string;
  readonly volumeOrder: number;
  readonly chapters: readonly LongManuscriptExportChapterOption[];
}

export function listLongManuscriptExportChapters(
  workspace: LongWorkspaceIndexSnapshot
): LongManuscriptExportChapterOption[] {
  const volumeOrder = new Map(
    workspace.plot.volumes.map((volume) => [volume.id, volume.order])
  );
  const volumeTitle = new Map(
    workspace.plot.volumes.map((volume) => [volume.id, volume.title])
  );
  return [...workspace.plot.chapterCards]
    .sort(
      (left, right) =>
        (volumeOrder.get(left.volumeId) ?? Number.MAX_SAFE_INTEGER) -
          (volumeOrder.get(right.volumeId) ?? Number.MAX_SAFE_INTEGER) ||
        left.narrativeOrder - right.narrativeOrder ||
        left.id.localeCompare(right.id)
    )
    .map((card) => ({
      id: card.id,
      title: card.title,
      volumeId: card.volumeId,
      volumeTitle:
        volumeTitle.get(card.volumeId) ??
        t("workspace.longManuscriptExportChapters.noVolume"),
      volumeOrder: volumeOrder.get(card.volumeId) ?? Number.MAX_SAFE_INTEGER,
      narrativeOrder: card.narrativeOrder
    }));
}

export function groupLongManuscriptExportChapters(
  chapters: readonly LongManuscriptExportChapterOption[]
): LongManuscriptExportChapterGroup[] {
  const groups: LongManuscriptExportChapterGroup[] = [];
  const indexByVolumeId = new Map<string, number>();
  for (const chapter of chapters) {
    const existingIndex = indexByVolumeId.get(chapter.volumeId);
    if (existingIndex === undefined) {
      indexByVolumeId.set(chapter.volumeId, groups.length);
      groups.push({
        volumeId: chapter.volumeId,
        volumeTitle: chapter.volumeTitle,
        volumeOrder: chapter.volumeOrder,
        chapters: [chapter]
      });
      continue;
    }
    const group = groups[existingIndex];
    if (!group) continue;
    groups[existingIndex] = {
      ...group,
      chapters: [...group.chapters, chapter]
    };
  }
  return groups;
}
