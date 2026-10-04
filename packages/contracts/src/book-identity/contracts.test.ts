import { describe, expect, it } from "vitest";
import {
  BookCoverDesignProfileSchema,
  BookSynopsisDesignProfileSchema,
  BookTitleDesignProfileSchema
} from "./profiles";
import {
  BookCoverDesignTaskInputSchema,
  BookSynopsisDesignTaskInputSchema,
  BookTitleDesignTaskInputSchema
} from "./tasks";
import { BookIdentityRecordSchema } from "./record";
import {
  BookIdentityExportCoverInputSchema,
  BookIdentitySubmitInputSchema
} from "./commands";
import { CoverAssetFileSchema } from "./candidates";
import {
  IMAGE_PRESET_IDS,
  IMAGE_MODEL_PRESETS,
  imageModelCapability
} from "../image-models/presets";
import { ImageModelSettingsInputSchema } from "../image-models/settings";
import { HttpsBaseUrlSchema } from "../https-base-url";

const book = { projectType: "short", projectId: "book_test" };
const profile = {
  id: "default",
  name: "通用",
  description: "测试档案",
  systemPrompt: "按作品事实设计。"
};
describe("book identity contracts", () => {
  it("uses design defaults and enforces per-field generation limits", () => {
    expect(BookTitleDesignProfileSchema.parse(profile)).toMatchObject({
      candidateCount: 8,
      titleLength: { min: 2, max: 15 },
      subtitle: "optional"
    });
    expect(BookSynopsisDesignProfileSchema.parse(profile)).toMatchObject({
      candidateCount: 3,
      targetLength: 200,
      includeHook: true
    });
    expect(BookCoverDesignProfileSchema.parse(profile)).toMatchObject({
      candidateCount: 3,
      imagesPerCandidate: 1,
      aspectRatio: "3:4",
      autoRender: true,
      titleRendering: "model"
    });
    expect(
      BookTitleDesignTaskInputSchema.safeParse({
        jobId: "job_test",
        book,
        candidateCount: 20
      }).success
    ).toBe(true);
    expect(
      BookTitleDesignTaskInputSchema.safeParse({
        jobId: "job_test",
        book,
        candidateCount: 21
      }).success
    ).toBe(false);
    expect(
      BookSynopsisDesignTaskInputSchema.safeParse({
        jobId: "job_test",
        book,
        candidateCount: 9
      }).success
    ).toBe(false);
    const cover = {
      jobId: "job_test",
      book,
      candidateCount: 4,
      imagesPerCandidate: 3,
      aspectRatio: "3:4",
      titleRendering: "overlay"
    };
    expect(BookCoverDesignTaskInputSchema.safeParse(cover).success).toBe(true);
    expect(
      BookCoverDesignTaskInputSchema.safeParse({
        ...cover,
        imagesPerCandidate: 4
      }).success
    ).toBe(false);
    expect(
      BookTitleDesignProfileSchema.safeParse({
        ...profile,
        titleLength: { min: 15, max: 2 }
      }).success
    ).toBe(false);
  });
  it("rejects unknown record versions and unsafe file or candidate identities", () => {
    const record = {
      schemaVersion: 1,
      kind: "deepwrite.book-identity",
      bookId: "book_test",
      revision: 0,
      updatedAt: "2026-10-02T00:00:00.000Z",
      adopted: {},
      rounds: []
    };
    expect(BookIdentityRecordSchema.safeParse(record).success).toBe(true);
    expect(
      BookIdentityRecordSchema.safeParse({ ...record, schemaVersion: 2 })
        .success
    ).toBe(false);
    expect(
      CoverAssetFileSchema.safeParse("covers/image_test.thumb.jpg").success
    ).toBe(true);
    for (const file of [
      "covers/../cover.png",
      "/covers/image_test.png",
      "covers/%2e%2e/image_test.png"
    ])
      expect(CoverAssetFileSchema.safeParse(file).success).toBe(false);
    expect(
      BookIdentitySubmitInputSchema.safeParse({
        book,
        roundId: "../round",
        field: "title",
        candidates: [
          { title: "新书", angle: "悬念", rationale: "理由", keywords: [] }
        ]
      }).success
    ).toBe(false);
  });
  it("requires all three ids when exporting a candidate image", () => {
    expect(
      BookIdentityExportCoverInputSchema.safeParse({ book, size: "original" })
        .success
    ).toBe(true);
    expect(
      BookIdentityExportCoverInputSchema.safeParse({
        book,
        size: "original",
        roundId: "round_test"
      }).success
    ).toBe(false);
    expect(
      BookIdentityExportCoverInputSchema.safeParse({
        book,
        size: "original",
        roundId: "round_test",
        candidateId: "cand_test",
        imageId: "img_test"
      }).success
    ).toBe(true);
  });
  it("keeps preset capability tables complete and unknown models conservative", () => {
    for (const id of IMAGE_PRESET_IDS) {
      const preset = IMAGE_MODEL_PRESETS[id];
      expect(preset.id).toBe(id);
      expect(Object.keys(preset.aspectRatios).length).toBeGreaterThan(0);
      expect(preset.maxImagesPerRequest).toBeGreaterThan(0);
      expect(
        imageModelCapability(id, "unknown-test-model").rendersCjkText
      ).toBe(false);
    }
    const input = {
      activeProfileId: null,
      profiles: [
        {
          presetId: "openai-compatible",
          name: "测试",
          baseUrl: "https://example.test/v1",
          model: "test-image-model",
          defaultAspectRatio: "2:3",
          apiKey: "invalid-test-key"
        }
      ]
    };
    expect(ImageModelSettingsInputSchema.safeParse(input).success).toBe(true);
    expect(
      ImageModelSettingsInputSchema.safeParse({
        ...input,
        profiles: Array.from({ length: 13 }, () => input.profiles[0])
      }).success
    ).toBe(false);
    for (const address of [
      "http://example.test",
      "https://invalid-test-key@example.test",
      "https://example.test?key=invalid-test-key"
    ])
      expect(HttpsBaseUrlSchema.safeParse(address).success).toBe(false);
  });
});
