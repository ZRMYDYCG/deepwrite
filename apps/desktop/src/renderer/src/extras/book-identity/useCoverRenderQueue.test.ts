import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoverRenderQueue } from "./useCoverRenderQueue";
import {
  bookIdentityAgentRunning,
  bookIdentityImageRunning,
  bookIdentityRunning
} from "../../stores/bookIdentityActivity";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
afterEach(() => {
  useCoverRenderQueue().items.splice(0);
  bookIdentityAgentRunning.value = false;
  vi.unstubAllGlobals();
});
describe("cover rendering queue", () => {
  it("shares two slots across books and stops queued work without dispatching it", async () => {
    const pending: ReturnType<typeof deferred>[] = [];
    const renderCover = vi.fn((_input: Record<string, unknown>) => {
      structuredClone(_input);
      const item = deferred();
      pending.push(item);
      return item.promise;
    });
    const cancelRender = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      deepwrite: { bookIdentity: { renderCover, cancelRender } }
    });
    const a = useCoverRenderQueue(),
      b = useCoverRenderQueue();
    const bookA = { projectType: "short" as const, projectId: "book_a" },
      bookB = { projectType: "long" as const, projectId: "book_b" };
    a.add(bookA, "round_a", "candidate_a", 4);
    b.add(bookB, "round_b", "candidate_b", 2);
    expect(bookIdentityImageRunning.value).toBe(true);
    expect(bookIdentityRunning.value).toBe(true);
    expect(renderCover).toHaveBeenCalledTimes(2);
    expect(a.items.filter((i) => i.state === "running")).toHaveLength(2);
    expect(renderCover.mock.calls[0]![0]).not.toHaveProperty("state");
    await a.stop(bookA);
    expect(cancelRender).toHaveBeenCalledTimes(2);
    expect(a.items.filter((i) => i.state === "queued")).toHaveLength(2);
    expect(bookIdentityRunning.value).toBe(true);
    pending[0]!.resolve();
    await vi.waitFor(() => expect(renderCover).toHaveBeenCalledTimes(3));
    expect(renderCover.mock.calls[2]![0]).toMatchObject({ book: bookB });
    pending[1]!.resolve();
    await vi.waitFor(() => expect(renderCover).toHaveBeenCalledTimes(4));
    pending[2]!.resolve();
    pending[3]!.resolve();
    await vi.waitFor(() => expect(a.pending.value).toBe(0));
    expect(bookIdentityImageRunning.value).toBe(false);
    expect(bookIdentityRunning.value).toBe(false);
  });
  it("continues queued requests after a failed image and retains the owning book", async () => {
    const renderCover = vi
      .fn()
      .mockRejectedValueOnce(new Error("test failure"))
      .mockResolvedValue(undefined);
    vi.stubGlobal("window", { deepwrite: { bookIdentity: { renderCover } } });
    const queue = useCoverRenderQueue();
    bookIdentityAgentRunning.value = true;
    const book = { projectType: "script" as const, projectId: "script_book" };
    queue.add(book, "round_script", "candidate_script", 3);
    await vi.waitFor(() => expect(queue.pending.value).toBe(0));
    expect(bookIdentityImageRunning.value).toBe(false);
    expect(bookIdentityRunning.value).toBe(true);
    expect(renderCover).toHaveBeenCalledTimes(3);
    for (const call of renderCover.mock.calls)
      expect(call[0]).toMatchObject({
        book,
        roundId: "round_script",
        candidateId: "candidate_script"
      });
  });
});
