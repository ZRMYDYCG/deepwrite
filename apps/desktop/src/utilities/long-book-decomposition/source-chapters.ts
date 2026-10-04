import {
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterCharacterStateFileId,
  longChapterHandoffFileId,
  longChapterForeshadowingChangesFileId,
  longChapterContinuityFilePath,
  type LongWorkspaceIndexSnapshot,
  type LongBookAnalysisChapter
} from "@deepwrite/contracts";
import { decompositionResourceId } from "./identity";
import type { ProjectTransactionFileOperation } from "../project-transaction";

export function appendDecompositionSourceChapters(
  index: LongWorkspaceIndexSnapshot,
  chapters: readonly LongBookAnalysisChapter[],
  jobId: string,
  timestamp: string
) {
  const files: ProjectTransactionFileOperation[] = [];
  for (const chapter of chapters) {
    const chapterId = decompositionResourceId("chapter", jobId, chapter.id);
    if (index.chapters.some(({ chapterCardId }) => chapterCardId === chapterId))
      continue;
    const volumeTitle = chapter.volume ?? "第一卷";
    let volume = index.plot.volumes.at(-1);
    if (!volume || volume.title !== volumeTitle) {
      volume = {
        id: decompositionResourceId("volume", jobId, `volume:${chapter.order}`),
        title: volumeTitle,
        order: index.plot.volumes.length + 1,
        summary: ""
      };
      index.plot.volumes.push(volume);
      index.plot.arcs.push({
        id: decompositionResourceId("arc", jobId, volume.id),
        volumeId: volume.id,
        title: "源文剧情",
        order: 1,
        outline: ""
      });
    }
    const arc = index.plot.arcs.find(({ volumeId }) => volumeId === volume.id)!;
    index.plot.chapterCards.push({
      id: chapterId,
      volumeId: volume.id,
      primaryArcId: arc.id,
      title: chapter.title,
      narrativeOrder:
        index.plot.chapterCards.filter(({ volumeId }) => volumeId === volume.id)
          .length + 1
    });
    const file = (id: string, name: string) => ({
      id,
      path: `long/chapters/${chapterId}/${name}`,
      updatedAt: timestamp
    });
    const entry = {
      chapterCardId: chapterId,
      body: file(longChapterBodyFileId(chapterId), "body.md"),
      card: file(longChapterCardFileId(chapterId), "card.md"),
      characterState: file(
        longChapterCharacterStateFileId(chapterId),
        "character-state.md"
      ),
      handoff: file(longChapterHandoffFileId(chapterId), "handoff.md"),
      foreshadowingChanges: {
        id: longChapterForeshadowingChangesFileId(chapterId),
        path: longChapterContinuityFilePath(
          chapterId,
          "foreshadowing-changes.md"
        ),
        updatedAt: timestamp
      },
      worldReveals: null,
      characterContinuity: [],
      bodyStatus: "written" as const,
      commitId: null
    };
    index.chapters.push(entry);
    for (const [ref, content] of [
      [entry.body, chapter.text],
      [entry.card, ""],
      [entry.characterState, ""],
      [entry.handoff, ""],
      [entry.foreshadowingChanges, ""]
    ] as const)
      files.push({ path: ref.path, content, expectedSha256: null });
  }
  return files;
}
