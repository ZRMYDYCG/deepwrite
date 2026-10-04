import {
  BOOK_IDENTITY_MAX_COMPOSED_BYTES,
  BookIdentityDesignContextSchema,
  BookIdentityReadCandidateResultSchema,
  type BookIdentityCandidate,
  type ChatAssistantProjectRef
} from "@deepwrite/contracts";
import { referencedAssets } from "./assets";
import { findCandidate, candidateSummary } from "./records";
import { identityFile, imageMime, readBytes } from "./io";
import { BookIdentityStore } from "./store";

export async function readContext(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  seedCandidateIds: readonly string[] = []
) {
  return store.read(book, (record) => {
    if (record.bookId !== book.projectId)
      throw new Error("记录来自其他作品，请先继承或清空参考候选。");
    const recent = [...record.rounds].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    const summaries = (field: "title" | "synopsis" | "cover", limit: number) =>
      recent
        .filter((round) => round.field === field)
        .flatMap((round) =>
          round.candidates.map((candidate) =>
            candidateSummary(field, candidate)
          )
        )
        .slice(0, limit);
    const candidates = record.rounds.flatMap<BookIdentityCandidate>(
      (round) => round.candidates
    );
    const seedCandidates = seedCandidateIds.map((id) => {
      const candidate = candidates.find((entry) => entry.id === id);
      if (!candidate) throw new Error("参考候选已不存在，请重新选择。");
      return candidate;
    });
    return BookIdentityDesignContextSchema.parse({
      adopted: record.adopted,
      recentTitles: summaries("title", 60),
      recentSynopsisHooks: summaries("synopsis", 12),
      recentCoverConcepts: summaries("cover", 18),
      seedCandidates
    });
  });
}

export async function readCandidate(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  roundId: string,
  candidateId: string
) {
  return store.read(book, (record) => {
    if (record.bookId !== book.projectId)
      throw new Error("记录来自其他作品，请先继承到本作品。");
    const { round, candidate } = findCandidate(record, roundId, candidateId);
    return BookIdentityReadCandidateResultSchema.parse({
      record,
      round,
      candidate
    });
  });
}

export async function resolveCoverAsset(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  file: string
) {
  return store.read(book, async (record, directory) => {
    if (
      !(file === "cover.png"
        ? !!record.adopted.cover
        : referencedAssets(record).has(file))
    )
      throw new Error("此封面文件未在作品中登记。");
    const path = await identityFile(directory, file);
    const bytes = await readBytes(path, BOOK_IDENTITY_MAX_COMPOSED_BYTES);
    return { path, mimeType: imageMime(bytes), byteSize: bytes.length };
  });
}
