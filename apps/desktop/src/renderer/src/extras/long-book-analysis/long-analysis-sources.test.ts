import { describe, expect, it, vi } from "vitest";
import {
  LongBookAnalysisSourceSchema,
  type DeepWriteApi,
  type LongBookAnalysisSavedSourceSummary
} from "@deepwrite/contracts/renderer";
import { createLongAnalysisSources } from "./long-analysis-sources";

function sample(id: string) {
  return LongBookAnalysisSourceSchema.parse({
    id,
    kind: "txt",
    name: "自写测试长篇",
    revision: 1,
    diagnostics: [],
    chapters: [
      {
        id: "chapter_test",
        order: 1,
        title: "第一章",
        text: "自写正文",
        charCount: 4,
        sourceName: "测试.txt"
      }
    ]
  });
}

function summary(id: string): LongBookAnalysisSavedSourceSummary {
  return {
    id,
    name: "自写测试长篇",
    kind: "txt",
    importedAt: "2026-10-02T00:00:00.000Z",
    chapterCount: 1,
    characterCount: 4
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  const remove = vi.fn(async (id: string) => id);
  const load = vi.fn(async (id: string) => sample(id));
  const list = vi.fn(async () => ({ sources: [summary("source_test")] }));
  const onChange = vi.fn();
  let busy = false;
  let disposed = false;
  const controller = createLongAnalysisSources({
    api: () =>
      ({
        longBookAnalysis: { sources: { delete: remove, load, list } }
      }) as unknown as DeepWriteApi,
    isBusy: () => busy,
    isDisposed: () => disposed,
    onChange
  });
  controller.source.value = sample("source_test");
  controller.savedSources.value = [summary("source_test"), summary("other")];
  return {
    controller,
    remove,
    load,
    list,
    onChange,
    setBusy: (value: boolean) => (busy = value),
    dispose: () => (disposed = true)
  };
}

describe("long analysis source deletion", () => {
  it("clears the deleted selection and corrections after persistence succeeds", async () => {
    const { controller, remove, onChange } = harness();
    controller.sourceDirty.value = true;
    await controller.deleteSavedSource("source_test");
    expect(remove).toHaveBeenCalledWith("source_test");
    expect(controller.savedSources.value.map(({ id }) => id)).toEqual([
      "other"
    ]);
    expect(controller.source.value).toBeNull();
    expect(controller.sourceDirty.value).toBe(false);
    expect(controller.sourceDeleting.value).toBe(false);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("keeps another selected source and its task context", async () => {
    const { controller, onChange } = harness();
    controller.sourceDirty.value = true;
    await controller.deleteSavedSource("other");
    expect(controller.source.value?.id).toBe("source_test");
    expect(controller.sourceDirty.value).toBe(true);
    expect(controller.savedSources.value.map(({ id }) => id)).toEqual([
      "source_test"
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves the list, selection and corrections when deletion fails", async () => {
    const { controller, remove, onChange } = harness();
    remove.mockRejectedValueOnce(new Error("仍有拆解任务引用来源"));
    controller.sourceDirty.value = true;
    await expect(controller.deleteSavedSource("source_test")).rejects.toThrow(
      "引用来源"
    );
    expect(controller.savedSources.value).toHaveLength(2);
    expect(controller.source.value?.id).toBe("source_test");
    expect(controller.sourceDirty.value).toBe(true);
    expect(controller.sourceDeleting.value).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("blocks deletion while running or saving and locks source changes during deletion", async () => {
    const { controller, remove, setBusy } = harness();
    setBusy(true);
    await expect(controller.deleteSavedSource("source_test")).rejects.toThrow();
    setBusy(false);
    controller.sourceSaving.value = true;
    await expect(controller.deleteSavedSource("source_test")).rejects.toThrow();
    controller.sourceSaving.value = false;
    expect(remove).not.toHaveBeenCalled();
    const pending = deferred<string>();
    remove.mockReturnValueOnce(pending.promise);
    const deletion = controller.deleteSavedSource("source_test");
    expect(controller.sourceDeleting.value).toBe(true);
    await expect(controller.deleteSavedSource("other")).rejects.toThrow();
    await expect(controller.loadSavedSource("other")).rejects.toThrow();
    await expect(controller.chooseSource("txt")).rejects.toThrow();
    expect(() => controller.replaceChapters([])).toThrow();
    controller.sourceDirty.value = true;
    await expect(controller.saveSource()).rejects.toThrow();
    pending.resolve("source_test");
    await deletion;
  });

  it("ignores stale source loads and catalog responses after deletion", async () => {
    const { controller, load, list } = harness();
    controller.source.value = null;
    const pendingLoad = deferred<ReturnType<typeof sample>>();
    const pendingList = deferred<{
      sources: LongBookAnalysisSavedSourceSummary[];
    }>();
    load.mockReturnValueOnce(pendingLoad.promise);
    list.mockReturnValueOnce(pendingList.promise);
    const loading = controller.loadSavedSource("source_test");
    const listing = controller.loadSavedSources();
    await controller.deleteSavedSource("source_test");
    pendingLoad.resolve(sample("source_test"));
    pendingList.resolve({ sources: [summary("source_test")] });
    expect(await loading).toBe(false);
    await listing;
    expect(controller.source.value).toBeNull();
    expect(controller.savedSources.value.map(({ id }) => id)).toEqual([
      "other"
    ]);
    expect(controller.sourcesLoading.value).toBe(false);
  });

  it("does not update disposed UI state when a pending deletion completes", async () => {
    const { controller, remove, dispose, onChange } = harness();
    const pending = deferred<string>();
    remove.mockReturnValueOnce(pending.promise);
    const deletion = controller.deleteSavedSource("source_test");
    dispose();
    pending.resolve("source_test");
    await deletion;
    expect(controller.savedSources.value).toHaveLength(2);
    expect(controller.source.value?.id).toBe("source_test");
    expect(onChange).not.toHaveBeenCalled();
  });
});
