import { describe, expect, it } from "vitest";
import { BookIdentityRecordSchema } from "@deepwrite/contracts";
import { CoverCapacity } from "./cover-capacity";

function record(revision: number, images: number) {
  return BookIdentityRecordSchema.parse({
    schemaVersion: 1,
    kind: "deepwrite.book-identity",
    bookId: "book_test",
    revision,
    updatedAt: "2026-10-02T12:00:00.000Z",
    adopted: {},
    rounds: [
      {
        id: "round_test",
        field: "cover",
        source: "agent",
        createdAt: "2026-10-02T12:00:00.000Z",
        request: {
          candidateCount: 1,
          imagesPerCandidate: 1,
          aspectRatio: "3:4",
          titleRendering: "overlay"
        },
        candidates: [
          {
            id: "candidate_test",
            concept: "孤灯",
            scene: "雨夜",
            composition: "顶部留白",
            palette: ["#112233"],
            artStyle: "油画",
            typography: "宋体",
            titlePlacement: "top",
            prompt: "无字夜景",
            rationale: "悬念",
            images: Array.from({ length: images }, (_, index) => ({
              id: `image_${index}`,
              file: `covers/image_${index}.png`,
              thumb: `covers/image_${index}.thumb.jpg`,
              width: 600,
              height: 800,
              imageProfile: {
                id: "img_test",
                presetId: "volcengine-seedream",
                model: "invalid-test-model"
              },
              createdAt: "2026-10-02T12:00:00.000Z"
            }))
          }
        ]
      }
    ]
  });
}

describe("cover capacity reservations", () => {
  it("lets only one concurrent request use the last available slot", () => {
    const capacity = new CoverCapacity();
    const release = capacity.reserve("short:book_test", record(1, 239));
    expect(() => capacity.reserve("short:book_test", record(1, 239))).toThrow(
      "240 张"
    );
    release();
    expect(() =>
      capacity.reserve("short:book_test", record(1, 239))
    ).not.toThrow();
  });

  it("does not revive capacity from a stale read and recognizes newer deletions", () => {
    const capacity = new CoverCapacity();
    capacity.observe("short:book_test", record(3, 240));
    expect(() => capacity.reserve("short:book_test", record(1, 239))).toThrow();
    expect(() =>
      capacity.reserve("short:book_test", record(4, 200))
    ).not.toThrow();
  });

  it("reserves the last slot in a round before a concurrent paid request", () => {
    const capacity = new CoverCapacity();
    const release = capacity.reserve(
      "short:book_test",
      record(1, 11),
      "round_test"
    );
    expect(() =>
      capacity.reserve("short:book_test", record(1, 11), "round_test")
    ).toThrow("12 张");
    release();
    capacity.observe("short:book_test", record(3, 12));
    expect(() =>
      capacity.reserve("short:book_test", record(1, 11), "round_test")
    ).toThrow("12 张");
    expect(() =>
      capacity.reserve("short:book_test", record(4, 10), "round_test")
    ).not.toThrow();
  });
});
