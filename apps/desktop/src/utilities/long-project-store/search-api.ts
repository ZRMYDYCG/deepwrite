import { LongFileIdSchema } from "@deepwrite/contracts";
import {
  boundedNonnegativeInteger,
  boundedPositiveInteger,
  secureDirectory
} from "./io";
import { loadProjectForRead } from "./read-project";
import { loadPublicPagedIndexedFile } from "./public-file-read";
import { parseProjectSearchResume, scanIndexedFileForSearch } from "./search";
import type { LongProjectStoreContext } from "./store-context";
import {
  DEFAULT_SEARCH_CONTEXT_CHARACTERS,
  DEFAULT_SEARCH_RESULTS,
  MAX_SEARCH_FILE_IDS,
  MAX_SEARCH_RESULTS,
  MAX_SEARCH_SCANNED_CHARACTERS,
  MAX_SEARCH_SCANNED_FILES,
  type LongProjectSearchMatch,
  type LongProjectSearchResume,
  type SearchLongProjectInput,
  type SearchLongProjectResult
} from "./types";

export async function search(
  ctx: LongProjectStoreContext,
  projectDirectory: string,
  input: SearchLongProjectInput
): Promise<SearchLongProjectResult> {
  const canonical = await secureDirectory(projectDirectory, "长篇项目目录");
  return await ctx.runExclusive(canonical, async () => {
    const loaded = await loadProjectForRead(ctx, canonical);
    const query = input.query.trim().normalize("NFC");
    if (!query || query.length > 256) {
      throw new Error("长篇搜索词必须包含 1 到 256 个字符。");
    }
    if (
      input.fileIds.length < 1 ||
      input.fileIds.length > MAX_SEARCH_FILE_IDS
    ) {
      throw new Error(
        `长篇搜索范围必须包含 1 到 ${MAX_SEARCH_FILE_IDS} 个文件。`
      );
    }
    const fileIds = input.fileIds.map((fileId) =>
      LongFileIdSchema.parse(fileId)
    );
    if (new Set(fileIds).size !== fileIds.length) {
      throw new Error("长篇搜索范围不能包含重复文件。");
    }
    const maxResults = boundedPositiveInteger(
      input.maxResults ?? DEFAULT_SEARCH_RESULTS,
      MAX_SEARCH_RESULTS,
      "搜索结果数"
    );
    const contextCharacters = boundedNonnegativeInteger(
      input.contextCharacters ?? DEFAULT_SEARCH_CONTEXT_CHARACTERS,
      500,
      "搜索上下文长度"
    );
    const resume = parseProjectSearchResume(input.resume, fileIds);
    const matches: LongProjectSearchMatch[] = [];
    let fileIndex = resume?.fileIndex ?? 0;
    let characterOffset = resume?.characterOffset ?? 0;
    let nextResume: LongProjectSearchResume | null = null;
    let scannedFileCount = 0;
    let scannedCharacterCount = 0;
    let lastCompletedFile: LongProjectSearchResume | null = null;

    while (
      fileIndex < fileIds.length &&
      matches.length < maxResults &&
      scannedFileCount < MAX_SEARCH_SCANNED_FILES &&
      scannedCharacterCount < MAX_SEARCH_SCANNED_CHARACTERS
    ) {
      const scannedFileIndex = fileIndex;
      const file = await loadPublicPagedIndexedFile(
        ctx,
        loaded,
        fileIds[fileIndex]!
      );
      const scanned = await scanIndexedFileForSearch(
        file,
        query,
        characterOffset,
        maxResults - matches.length,
        contextCharacters,
        MAX_SEARCH_SCANNED_CHARACTERS - scannedCharacterCount
      );
      scannedFileCount += 1;
      scannedCharacterCount += scanned.scannedCharacters;
      matches.push(...scanned.matches);
      if (scanned.nextMatchOffset !== null) {
        nextResume = {
          fileIndex,
          fileId: scanned.fileId,
          characterOffset: scanned.nextMatchOffset
        };
        break;
      }
      lastCompletedFile = {
        fileIndex: scannedFileIndex,
        fileId: scanned.fileId,
        characterOffset: scanned.characterLength
      };
      fileIndex += 1;
      characterOffset = 0;
    }

    if (
      nextResume === null &&
      fileIndex < fileIds.length &&
      lastCompletedFile !== null
    ) {
      nextResume = lastCompletedFile;
    }

    return {
      query,
      matches,
      nextResume,
      truncated: nextResume !== null
    };
  });
}
