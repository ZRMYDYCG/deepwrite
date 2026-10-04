import { effectScope, nextTick, ref } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import {
  BookIdentityRecordSchema,
  BookIdentityCoverRoundSchema,
  CoverLayoutSchema,
  type BookIdentityRecord,
  type ChatAssistantProjectRef
} from "@deepwrite/contracts/renderer";
import { useBookIdentity } from "./useBookIdentity";
import { useIdentityCandidateEditing } from "./useIdentityCandidateEditing";

vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  onBeforeUnmount: vi.fn()
}));
vi.mock("../../ui-feedback", () => ({
  uiMessage: { error: vi.fn(), success: vi.fn() }
}));
afterEach(() => vi.unstubAllGlobals());

it("saves and adopts a composition on its original book after selection changes", async () => {
  const original: ChatAssistantProjectRef = {
    projectType: "short",
    projectId: "original_book"
  };
  const other: ChatAssistantProjectRef = {
    projectType: "long",
    projectId: "other_book"
  };
  const timestamp = "2026-10-02T12:00:00.000Z";
  const round = BookIdentityCoverRoundSchema.parse({
    id: "cover_round",
    field: "cover",
    source: "agent",
    createdAt: timestamp,
    request: {
      candidateCount: 1,
      imagesPerCandidate: 1,
      aspectRatio: "3:4",
      titleRendering: "overlay"
    },
    candidates: [
      {
        id: "cover_candidate",
        concept: "雨夜",
        scene: "空旷街道",
        composition: "顶部留白",
        palette: ["#ffffff"],
        artStyle: "插画",
        typography: "宋体",
        titlePlacement: "top",
        prompt: "An empty street in rain",
        rationale: "呼应故事",
        images: [
          {
            id: "cover_image",
            file: "covers/cover_image.png",
            thumb: "covers/cover_image.thumb.png",
            width: 600,
            height: 800,
            createdAt: timestamp,
            imageProfile: {
              id: "image_profile",
              presetId: "openai-compatible",
              model: "test-image"
            }
          }
        ]
      }
    ]
  });
  const record = (book: ChatAssistantProjectRef) =>
    BookIdentityRecordSchema.parse({
      schemaVersion: 1,
      kind: "deepwrite.book-identity",
      bookId: book.projectId,
      revision: 0,
      updatedAt: timestamp,
      adopted: {},
      rounds: book.projectId === original.projectId ? [round] : []
    });
  let finishSave!: (value: BookIdentityRecord) => void;
  const saveComposedCover = vi.fn((input: unknown) => {
    structuredClone(input);
    return new Promise<BookIdentityRecord>((resolve) => {
      finishSave = resolve;
    });
  });
  const adopt = vi.fn((input: unknown) => {
    structuredClone(input);
    return Promise.resolve(record(original));
  });
  vi.stubGlobal("window", {
    deepwrite: {
      bookIdentity: {
        get: ({ book }: { book: ChatAssistantProjectRef }) =>
          Promise.resolve(record(book)),
        saveComposedCover,
        adopt
      },
      events: { subscribe: () => vi.fn() }
    }
  });
  const selected = ref<ChatAssistantProjectRef | null>(original);
  const scope = effectScope();
  const { controller, editor } = scope.run(() => {
    const controller = useBookIdentity(selected);
    return {
      controller,
      editor: useIdentityCandidateEditing(controller, selected, ref("cover"))
    };
  })!;
  try {
    const candidate = round.candidates[0]!;
    editor.composer.value = { round, candidate, image: candidate.images[0]! };
    const saving = editor.saveComposition(
      CoverLayoutSchema.parse({
        template: "top-center",
        title: "雨夜",
        fontFamily: "Songti SC",
        color: "#ffffff"
      }),
      "test-png-base64",
      true
    );
    selected.value = other;
    await nextTick();
    finishSave(record(original));
    await saving;
    expect(saveComposedCover).toHaveBeenCalledWith(
      expect.objectContaining({ book: original })
    );
    expect(adopt).toHaveBeenCalledWith(
      expect.objectContaining({ book: original, imageId: "cover_image" })
    );
    expect(controller.record.value?.bookId).toBe(other.projectId);
  } finally {
    scope.stop();
  }
});
