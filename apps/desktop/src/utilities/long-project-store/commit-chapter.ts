import {
  LongCommitChapterInputSchema,
  type LongCommitChapterResult
} from "@deepwrite/contracts";
import { commitStructuredChapter } from "./commit-chapter-structured";
import { commitTextFilesChapter } from "./commit-chapter-text-files";
import { commitTextFilesBatch } from "./commit-chapter-text-files-batch";
import { secureDirectory } from "./io";
import { loadProject } from "./load-project";
import type { LongProjectStoreContext } from "./store-context";
import type { StoreCommitLongChapterInput } from "./types";

export async function commitChapter(
  ctx: LongProjectStoreContext,
  projectDirectory: string,
  rawInput: StoreCommitLongChapterInput
): Promise<LongCommitChapterResult> {
  const canonical = await secureDirectory(projectDirectory, "长篇项目目录");
  return await ctx.runExclusive(canonical, async () => {
    const loaded = await loadProject(ctx, canonical);
    const { managedCommitId, ...publicInput } =
      rawInput.mode === "text_files_batch"
        ? rawInput
        : { ...rawInput, managedCommitId: undefined };
    const input = LongCommitChapterInputSchema.parse({
      ...publicInput,
      bookId: loaded.manifest.id
    });
    if (input.mode === "text_files_batch") {
      return await commitTextFilesBatch(ctx, loaded, input, managedCommitId);
    }
    const chapterEntry = loaded.index.chapters.find(
      ({ chapterCardId }) => chapterCardId === input.chapterCardId
    );
    if (!chapterEntry || chapterEntry.commitId !== null) {
      throw new Error("当前长篇章卡不存在或已经有连续性记录。");
    }
    if (chapterEntry.bodyStatus !== "written") {
      throw new Error("只有正文已经完成的章节才能创建连续性记录。");
    }
    return input.mode === "text_files"
      ? await commitTextFilesChapter(ctx, loaded, input, chapterEntry)
      : await commitStructuredChapter(ctx, loaded, input, chapterEntry);
  });
}
