import {
  BOOK_IDENTITY_MAX_IMAGES,
  BOOK_IDENTITY_MAX_IMAGES_PER_ROUND,
  type BookIdentityRecord
} from "@deepwrite/contracts";
import { SafeImageError } from "../../main/image/image-http";

interface Capacity {
  revision: number;
  stored: number;
  reserved: number;
}

function countImages(record: BookIdentityRecord, roundId?: string): number {
  return record.rounds.reduce(
    (sum, round) =>
      sum +
      (round.field === "cover" && (!roundId || round.id === roundId)
        ? round.candidates.reduce(
            (count, candidate) => count + candidate.images.length,
            0
          )
        : 0),
    0
  );
}

/** Reservations prevent two concurrent requests from paying for the final available slot. */
export class CoverCapacity {
  private readonly books = new Map<string, Capacity>();
  private readonly rounds = new Map<string, Capacity>();

  private observeRound(
    key: string,
    record: BookIdentityRecord,
    roundId: string
  ) {
    const roundKey = `${key}:${roundId}`;
    const capacity = this.rounds.get(roundKey) ?? {
      revision: -1,
      stored: 0,
      reserved: 0
    };
    if (record.revision >= capacity.revision) {
      capacity.revision = record.revision;
      capacity.stored = countImages(record, roundId);
    }
    this.rounds.set(roundKey, capacity);
    return capacity;
  }

  observe(key: string, record: BookIdentityRecord): Capacity {
    const capacity = this.books.get(key) ?? {
      revision: -1,
      stored: 0,
      reserved: 0
    };
    if (record.revision >= capacity.revision) {
      capacity.revision = record.revision;
      capacity.stored = countImages(record);
    }
    this.books.set(key, capacity);
    for (const round of record.rounds)
      if (round.field === "cover") this.observeRound(key, record, round.id);
    return capacity;
  }

  reserve(
    key: string,
    record: BookIdentityRecord,
    roundId?: string
  ): () => void {
    const capacity = this.observe(key, record);
    if (capacity.stored + capacity.reserved >= BOOK_IDENTITY_MAX_IMAGES)
      throw new SafeImageError("本作品封面图已达到 240 张，请先清理旧记录。");
    const round = roundId ? this.observeRound(key, record, roundId) : undefined;
    if (
      round &&
      round.stored + round.reserved >= BOOK_IDENTITY_MAX_IMAGES_PER_ROUND
    )
      throw new SafeImageError("本轮封面图已达到 12 张，请生成新一轮方案。");
    capacity.reserved += 1;
    if (round) round.reserved += 1;
    return () => {
      capacity.reserved -= 1;
      if (round) round.reserved -= 1;
    };
  }
}
