import { effectScope, isProxy, nextTick, ref, type EffectScope } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import {
  BookIdentityRecordSchema,
  createEnvelope,
  type BookIdentityRecord,
  type SystemEventEnvelope,
  type ChatAssistantProjectRef
} from "@deepwrite/contracts/renderer";
import { useBookIdentity } from "./useBookIdentity";

const lifecycle = vi.hoisted(() => ({ dispose: [] as Array<() => void> }));
vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  onBeforeUnmount: (callback: () => void) => lifecycle.dispose.push(callback)
}));
vi.mock("../../ui-feedback", () => ({ uiMessage: { error: vi.fn() } }));
const scopes: EffectScope[] = [];
const bookA: ChatAssistantProjectRef = {
  projectType: "short",
  projectId: "book_a"
};
const bookB: ChatAssistantProjectRef = {
  projectType: "long",
  projectId: "book_b"
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function record(book: ChatAssistantProjectRef, revision: number) {
  return BookIdentityRecordSchema.parse({
    schemaVersion: 1,
    kind: "deepwrite.book-identity",
    bookId: book.projectId,
    revision,
    updatedAt: "2026-10-02T12:00:00.000Z",
    adopted: {},
    rounds: revision
      ? [
          {
            id: `round_${revision}`,
            field: "title",
            source: "manual",
            createdAt: "2026-10-02T12:00:00.000Z",
            request: { candidateCount: 1 },
            candidates: [
              {
                id: `cand_${revision}`,
                title: `标题${revision}`,
                angle: "",
                rationale: "",
                keywords: []
              }
            ]
          }
        ]
      : []
  });
}
function harness(
  get: ReturnType<typeof vi.fn>,
  updateCandidate = vi.fn().mockResolvedValue(record(bookA, 1)),
  inheritBook = vi.fn().mockResolvedValue(record(bookA, 2))
) {
  let listener!: (event: SystemEventEnvelope) => void;
  vi.stubGlobal("window", {
    deepwrite: {
      bookIdentity: { get, updateCandidate, inheritBook },
      events: {
        subscribe: (callback: typeof listener) => {
          listener = callback;
          return vi.fn();
        }
      }
    }
  });
  const selected = ref<ChatAssistantProjectRef | null>(bookA);
  const scope = effectScope();
  scopes.push(scope);
  const controller = scope.run(() => useBookIdentity(selected))!;
  const emit = (revision: number) =>
    listener(
      createEnvelope(
        "book_identity.updated",
        { bookKey: "short:book_a", revision },
        {
          id: `update_${revision}`,
          context: { correlationId: "identity_test" }
        }
      ) as SystemEventEnvelope
    );
  return { selected, controller, emit };
}
afterEach(() => {
  lifecycle.dispose.splice(0).forEach((dispose) => dispose());
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
});

it("keeps a manual candidate acknowledgement when an older initial read arrives later", async () => {
  const oldRead = deferred<BookIdentityRecord>();
  const { controller } = harness(vi.fn(() => oldRead.promise));
  await controller.mutate(async () => record(bookA, 1));
  oldRead.resolve(record(bookA, 0));
  await nextTick();
  expect(controller.record.value?.revision).toBe(1);
  expect(controller.counts.value.title).toBe(1);
});

it("rejects a late acknowledgement after a newer update-event refresh has arrived", async () => {
  const mutation = deferred<BookIdentityRecord>();
  const get = vi
    .fn()
    .mockResolvedValueOnce(record(bookA, 0))
    .mockResolvedValueOnce(record(bookA, 2));
  const { controller, emit } = harness(get);
  await nextTick();
  const writing = controller.mutate(() => mutation.promise);
  emit(2);
  await nextTick();
  mutation.resolve(record(bookA, 1));
  await writing;
  expect(controller.record.value?.revision).toBe(2);
  expect(controller.record.value?.rounds[0]?.id).toBe("round_2");
});

it("keeps pending reads and writes associated with the book they started on", async () => {
  const oldRead = deferred<BookIdentityRecord>();
  const oldWrite = deferred<BookIdentityRecord>();
  const get = vi
    .fn()
    .mockReturnValueOnce(oldRead.promise)
    .mockResolvedValueOnce(record(bookB, 3));
  const { controller, selected } = harness(get);
  const writing = controller.mutate(() => oldWrite.promise);
  selected.value = bookB;
  await nextTick();
  await nextTick();
  oldRead.resolve(record(bookA, 0));
  oldWrite.resolve(record(bookA, 4));
  await writing;
  expect(controller.record.value).toMatchObject({
    bookId: "book_b",
    revision: 3
  });
  expect(controller.loading.value).toBe(false);
});

it("sends plain book snapshots across the context bridge for reads and mutations", async () => {
  const get = vi.fn((input: { book: ChatAssistantProjectRef }) => {
    structuredClone(input);
    return Promise.resolve(record(bookA, 0));
  });
  const update = vi.fn((input: { book: ChatAssistantProjectRef }) => {
    structuredClone(input);
    return Promise.resolve(record(bookA, 1));
  });
  const { controller } = harness(get, update);
  await nextTick();
  const request = get.mock.calls[0]?.[0] as { book: ChatAssistantProjectRef };
  expect(isProxy(request.book)).toBe(false);
  expect(structuredClone(request)).toEqual({ book: bookA });
  await controller.mutate(async (book) => {
    expect(isProxy(book)).toBe(false);
    expect(structuredClone(book)).toEqual(bookA);
    return record(bookA, 1);
  });
  expect(controller.record.value?.revision).toBe(1);
  await controller.update("round_1", "cand_1", {
    starred: true,
    keywords: ["雨夜"]
  });
  expect(structuredClone(update.mock.calls[0]?.[0])).toMatchObject({
    book: bookA,
    patch: { starred: true, keywords: ["雨夜"] }
  });
});

it("ends loading when the selection clears while an old read is still pending", async () => {
  const oldRead = deferred<BookIdentityRecord>();
  const { controller, selected } = harness(vi.fn(() => oldRead.promise));
  expect(controller.loading.value).toBe(true);
  selected.value = null;
  await nextTick();
  expect(controller.loading.value).toBe(false);
  oldRead.resolve(record(bookA, 1));
  await nextTick();
  expect(controller.record.value).toBeNull();
});

it("hides ignored foreign records and restores them after successful inheritance", async () => {
  const foreign = record(bookB, 1);
  foreign.diagnostics = { foreignBookId: bookB.projectId };
  const { controller } = harness(vi.fn().mockResolvedValue(foreign));
  await nextTick();
  expect(controller.counts.value.title).toBe(1);
  controller.ignored.value = true;
  expect(controller.visibleRecord.value).toBeNull();
  expect(controller.counts.value).toEqual({ title: 0, synopsis: 0, cover: 0 });
  expect(controller.record.value?.diagnostics?.foreignBookId).toBe("book_b");
  expect(controller.writable.value).toBe(false);
  await controller.inherit();
  expect(controller.ignored.value).toBe(false);
  expect(controller.visibleRecord.value?.bookId).toBe("book_a");
  expect(controller.counts.value.title).toBe(1);
  expect(controller.writable.value).toBe(true);
});

it("keeps ignored foreign records hidden when inheritance fails", async () => {
  const foreign = record(bookB, 1);
  foreign.diagnostics = { foreignBookId: bookB.projectId };
  const { controller } = harness(
    vi.fn().mockResolvedValue(foreign),
    undefined,
    vi.fn().mockRejectedValue(new Error("Inheritance failed"))
  );
  await nextTick();
  controller.ignored.value = true;
  await controller.inherit();
  expect(controller.ignored.value).toBe(true);
  expect(controller.visibleRecord.value).toBeNull();
  expect(controller.record.value?.bookId).toBe("book_b");
});

it("retains the displayed record during refresh and ignores duplicate acknowledgements", async () => {
  const refresh = deferred<BookIdentityRecord>();
  const get = vi
    .fn()
    .mockResolvedValueOnce(record(bookA, 1))
    .mockReturnValueOnce(refresh.promise);
  const { controller } = harness(get);
  await nextTick();
  const displayed = controller.record.value;
  const loading = controller.load();
  expect(controller.record.value).toBe(displayed);
  expect(controller.counts.value.title).toBe(1);
  refresh.resolve(record(bookA, 1));
  await loading;
  expect(controller.record.value).toBe(displayed);
  await controller.mutate(async () => record(bookA, 1));
  expect(controller.record.value).toBe(displayed);
});

it("keeps the current candidates and adoption when saving fails", async () => {
  const original = record(bookA, 1);
  original.adopted.title = {
    candidateId: "cand_1",
    title: "标题1",
    adoptedAt: "2026-10-02T12:00:00.000Z"
  };
  const { controller } = harness(vi.fn().mockResolvedValue(original));
  await nextTick();
  const displayed = controller.record.value;
  await controller.mutate(async () => {
    throw new Error("Save failed");
  });
  expect(controller.record.value).toBe(displayed);
  expect(controller.record.value?.adopted.title?.candidateId).toBe("cand_1");
  expect(controller.counts.value.title).toBe(1);
  expect(controller.saving.value).toBe(false);
});

it("locks concurrent writes until the pending save completes without clearing candidates", async () => {
  const pending = deferred<BookIdentityRecord>();
  const { controller } = harness(vi.fn().mockResolvedValue(record(bookA, 1)));
  await nextTick();
  const displayed = controller.record.value;
  const first = vi.fn(() => pending.promise);
  const duplicate = vi.fn(async () => record(bookA, 3));
  const writing = controller.mutate(first);
  expect(controller.saving.value).toBe(true);
  expect(controller.record.value).toBe(displayed);
  await controller.mutate(duplicate);
  expect(duplicate).not.toHaveBeenCalled();
  expect(controller.saving.value).toBe(true);
  pending.resolve(record(bookA, 2));
  await writing;
  expect(controller.saving.value).toBe(false);
  await controller.mutate(duplicate);
  expect(duplicate).toHaveBeenCalledOnce();
  expect(controller.record.value?.revision).toBe(3);
});
