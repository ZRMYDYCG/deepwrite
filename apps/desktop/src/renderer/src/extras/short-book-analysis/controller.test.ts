import { it, expect, vi } from "vitest";
import { effectScope } from "vue";
import type {
  DeepWriteApi,
  ModelConfig,
  ShortBookAnalysisPreset,
  ShortBookAnalysisSource
} from "@deepwrite/contracts/renderer";
import {
  createExtrasAgentsFake,
  outputEvent,
  runEvent
} from "../agent-runtime/extrasAgent.test-support";
import { useShortBookAnalysis } from "./useShortBookAnalysis";
const preset: ShortBookAnalysisPreset = {
  id: "preset",
  name: "分析",
  description: "测试",
  systemPrompt: "分析",
  selectionMode: "multiple",
  output: { domain: "material", kind: "plot", stageId: "pacing" }
};
const book = (i: number): ShortBookAnalysisSource => ({
  id: `book-${i}`,
  title: `测试${i}`,
  text: "完整正文",
  kind: "paste",
  importedAt: "2026-01-01T00:00:00.000Z"
});
it("removes drafts without deleting saved sources and allows loading them again", async () => {
  const scope = effectScope();
  const sources = [book(0), book(1)];
  const summaries = sources.map(({ text, ...source }) => ({
    ...source,
    characterCount: text.length
  }));
  const remove = vi.fn(async (id: string) => id);
  const load = vi.fn(async () => book(1));
  const api = {
    shortBookAnalysis: {
      sources: {
        delete: remove,
        load,
        list: async () => ({ sources: summaries })
      }
    }
  } as unknown as DeepWriteApi;
  const c = scope.run(() => useShortBookAnalysis({ api: () => api }))!;
  try {
    c.drafts.value = sources;
    c.savedSources.value = summaries;
    c.activeId.value = "book-1";
    c.selectedIds.value = ["book-1"];
    c.removeBook("book-1");
    expect(c.drafts.value.map((source) => source.id)).toEqual(["book-0"]);
    expect(c.activeId.value).toBe("book-0");
    expect(c.selectedIds.value).toEqual([]);
    expect(c.savedSources.value).toEqual(summaries);
    expect(remove).not.toHaveBeenCalled();
    await c.loadSource("book-1");
    expect(load).toHaveBeenCalledWith("book-1");
    expect(c.activeId.value).toBe("book-1");
    expect(c.drafts.value).toHaveLength(2);
    c.removeBook("book-0");
    c.removeBook("book-1");
    expect(c.drafts.value).toEqual([]);
    expect(c.activeId.value).toBe("");
    expect(c.savedSources.value).toEqual(summaries);
    c.result.value = {
      name: "保留结果",
      description: "用于提炼写作方法。",
      content: "其他分析"
    };
    await c.deleteSource("book-1");
    expect(c.savedSources.value.map((source) => source.id)).toEqual(["book-0"]);
    expect(c.result.value?.content).toBe("其他分析");
  } finally {
    c.dispose();
    scope.stop();
  }
});
it("clears temporary analysis content while keeping imported stories and model choice", () => {
  const scope = effectScope();
  const c = scope.run(() => useShortBookAnalysis({ api: () => undefined }))!;
  try {
    c.drafts.value = [book(0)];
    c.savedSources.value = [{ ...book(0), characterCount: 4 }];
    c.selectedIds.value = ["book-0"];
    c.activeId.value = "book-0";
    c.selectedModelId.value = "model-1";
    c.result.value = {
      name: "临时结果",
      description: "测试",
      content: "待清空"
    };
    c.status.value = "completed";
    c.resetWorkspace();
    expect(c.drafts.value).toEqual([]);
    expect(c.selectedIds.value).toEqual([]);
    expect(c.activeId.value).toBe("");
    expect(c.result.value).toBeNull();
    expect(c.status.value).toBe("idle");
    expect(c.savedSources.value).toHaveLength(1);
    expect(c.selectedModelId.value).toBe("model-1");
    c.status.value = "running";
    c.drafts.value = [book(1)];
    expect(() => c.resetWorkspace()).toThrow();
    expect(c.drafts.value).toHaveLength(1);
  } finally {
    c.dispose();
    scope.stop();
  }
});
it("deletes saved sources, repairs selection and active editor, and preserves state on failure", async () => {
  const scope = effectScope();
  const remove = vi.fn(async (id: string) => id);
  const api = {
    shortBookAnalysis: { sources: { delete: remove } }
  } as unknown as DeepWriteApi;
  const c = scope.run(() => useShortBookAnalysis({ api: () => api }))!;
  try {
    c.drafts.value = [book(0), book(1), book(2)];
    c.savedSources.value = c.drafts.value.map(({ text, ...source }) => ({
      ...source,
      characterCount: text.length
    }));
    c.selectedIds.value = ["book-0", "book-1"];
    c.activeId.value = "book-1";
    c.result.value = {
      name: "旧结果",
      description: "用于提炼写作方法。",
      content: "旧分析"
    };
    c.status.value = "completed";
    remove.mockRejectedValueOnce(new Error("删除失败"));
    await expect(c.deleteSource("book-1")).rejects.toThrow("删除失败");
    expect(c.drafts.value).toHaveLength(3);
    expect(c.savedSources.value).toHaveLength(3);
    expect(c.selectedIds.value).toEqual(["book-0", "book-1"]);
    expect(c.activeId.value).toBe("book-1");
    expect(c.result.value?.content).toBe("旧分析");
    expect(c.loading.value).toBe(false);
    await c.deleteSource("book-1");
    expect(remove).toHaveBeenLastCalledWith("book-1");
    expect(c.drafts.value.map((source) => source.id)).toEqual([
      "book-0",
      "book-2"
    ]);
    expect(c.savedSources.value.map((source) => source.id)).toEqual([
      "book-0",
      "book-2"
    ]);
    expect(c.selectedIds.value).toEqual(["book-0"]);
    expect(c.activeId.value).toBe("book-2");
    expect(c.result.value?.content).toBe("旧分析");
    await c.deleteSource("book-0");
    expect(c.activeId.value).toBe("book-2");
    await c.deleteSource("book-2");
    expect(c.activeId.value).toBe("");
    expect(c.drafts.value).toEqual([]);
    expect(c.savedSources.value).toEqual([]);
    expect(c.selectedIds.value).toEqual([]);
  } finally {
    c.dispose();
    scope.stop();
  }
});
it("blocks deletion during analysis and while another source operation is pending", async () => {
  const scope = effectScope();
  let finish!: (id: string) => void;
  const remove = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      })
  );
  const api = {
    shortBookAnalysis: { sources: { delete: remove } }
  } as unknown as DeepWriteApi;
  const c = scope.run(() => useShortBookAnalysis({ api: () => api }))!;
  try {
    c.status.value = "running";
    expect(() => c.removeBook("book-0")).toThrow("正在处理");
    await expect(c.deleteSource("book-0")).rejects.toThrow("正在处理");
    expect(remove).not.toHaveBeenCalled();
    c.status.value = "idle";
    const pending = c.deleteSource("book-0");
    expect(c.loading.value).toBe(true);
    expect(() => c.removeBook("book-1")).toThrow("正在处理");
    await expect(c.deleteSource("book-1")).rejects.toThrow("正在处理");
    expect(() => c.toggleBook("book-1")).toThrow("正在处理");
    finish("book-0");
    await pending;
    expect(c.loading.value).toBe(false);
  } finally {
    c.dispose();
    scope.stop();
  }
});
it("retains selections on preset change, enforces ten and saves edited results through catalog", async () => {
  const scope = effectScope();
  const createLibraryEntry = vi.fn(async () => ({}));
  const fake = createExtrasAgentsFake({
    "short-book-analysis": [
      preset,
      { ...preset, id: "single", selectionMode: "single" }
    ]
  });
  const api = {
    catalog: { createLibraryEntry },
    extrasAgents: fake.extrasAgents,
    session: { abort: vi.fn(async () => ({})) }
  } as unknown as DeepWriteApi;
  const c = scope.run(() => useShortBookAnalysis({ api: () => api }))!;
  try {
    await c.loadPresets();
    c.drafts.value = Array.from({ length: 11 }, (_, i) => book(i));
    for (let i = 0; i < 10; i++) c.toggleBook(`book-${i}`);
    expect(c.selectionValid.value).toBe(true);
    expect(() => c.toggleBook("book-10")).toThrow("10");
    c.selectedPresetId.value = "single";
    c.toggleBook("book-10");
    expect(c.selectedIds.value).toEqual(["book-10"]);
    expect(c.selectionValid.value).toBe(true);
    c.toggleBook("book-0");
    expect(c.selectedIds.value).toEqual(["book-0"]);
    c.selectedPresetId.value = "preset";
    c.updateBook("book-0", { title: "测试0", text: "" });
    expect(c.selectionValid.value).toBe(false);
    expect(c.drafts.value[0]?.text).toBe("");
    c.updateBook("book-0", { title: "测试0", text: "完整正文" });
    c.setConfiguredModels([
      {
        id: "model",
        defaultThinkingLevel: "off",
        thinkingLevelOptions: ["off"],
        contextWindow: 100000,
        maxTokens: 16000
      } as ModelConfig
    ]);
    c.start();
    expect(createLibraryEntry).not.toHaveBeenCalled();
    expect(fake.run.mock.calls[0]![0].task).toMatchObject({
      agentId: "short-book-analysis",
      profileId: "preset"
    });
    expect(() =>
      c.updateBook("book-0", { title: "修改", text: "修改" })
    ).toThrow("正在处理");
    expect(() => c.toggleBook("book-0")).toThrow();
    await Promise.resolve();
    const request = fake.run.mock.calls[0]![0];
    expect(request.task.input).not.toHaveProperty("libraryId");
    c.handleEvent(
      outputEvent(request, {
        kind: "book-analysis-result",
        result: {
          name: "生成结果",
          description: "用于提炼写作方法。",
          content: "原始内容"
        }
      })
    );
    c.handleEvent(runEvent("agent.message_completed", request));
    await vi.waitFor(() => expect(c.status.value).toBe("completed"));
    expect(createLibraryEntry).not.toHaveBeenCalled();
    c.result.value = {
      name: "已编辑结果",
      description: "用于提炼写作方法。",
      content: "整理后的综合分析"
    };
    await c.persistResult({ libraryId: "library", baseProjectRevision: 7 });
    expect(createLibraryEntry).toHaveBeenCalledWith({
      domain: "material",
      libraryId: "library",
      title: "已编辑结果",
      content:
        '---\nname: "已编辑结果"\ndescription: "用于提炼写作方法。"\n---\n\n整理后的综合分析',
      stageId: "pacing",
      baseProjectRevision: 7
    });
    c.presets.value.push({
      ...preset,
      id: "skill",
      name: "技能分析",
      output: { domain: "skill", kind: "general", stageId: "outline" }
    });
    c.selectedPresetId.value = "skill";
    c.start();
    expect(c.resultIsPrevious.value).toBe(true);
    await c.persistResult({ libraryId: "library" });
    expect(createLibraryEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        domain: "material",
        stageId: "pacing",
        title: "已编辑结果"
      })
    );
  } finally {
    c.dispose();
    scope.stop();
  }
});
it("saves and resets presets through the unified extras agent profiles", async () => {
  const scope = effectScope();
  const fake = createExtrasAgentsFake({ "short-book-analysis": [preset] });
  const api = {
    extrasAgents: fake.extrasAgents
  } as unknown as DeepWriteApi;
  const c = scope.run(() => useShortBookAnalysis({ api: () => api }))!;
  try {
    await c.loadPresets();
    expect(c.presets.value).toEqual([{ ...preset, builtin: true }]);
    const custom = { ...preset, id: "custom", name: "自定义" };
    await c.savePresets([...c.presets.value, custom]);
    expect(fake.save).toHaveBeenCalledWith({
      agentId: "short-book-analysis",
      profiles: [preset, custom]
    });
    expect(c.presets.value.map((item) => item.id)).toEqual([
      "preset",
      "custom"
    ]);
    await c.resetPresets();
    expect(c.presets.value.map((item) => item.id)).toEqual(["preset"]);
  } finally {
    c.dispose();
    scope.stop();
  }
});

it("selects an imported single book immediately but leaves multiple-book selection explicit", async () => {
  const scope = effectScope();
  const api = {
    shortBookAnalysis: {
      chooseSources: async () => [book(1)],
      sources: {
        list: async () => ({ sources: [] }),
        load: async () => book(2)
      }
    }
  } as unknown as DeepWriteApi;
  const c = scope.run(() => useShortBookAnalysis({ api: () => api }))!;
  try {
    c.presets.value = [
      { ...preset, id: "single", selectionMode: "single" },
      preset
    ];
    c.selectedPresetId.value = "single";
    await c.chooseSources();
    expect(c.selectedIds.value).toEqual(["book-1"]);
    expect(c.selectionValid.value).toBe(true);
    await c.loadSource("book-2");
    expect(c.selectedIds.value).toEqual(["book-2"]);
    c.toggleBook("book-1");
    expect(c.selectedIds.value).toEqual(["book-1"]);
    c.selectedPresetId.value = "preset";
    c.selectedIds.value = [];
    await c.chooseSources();
    expect(c.selectedIds.value).toEqual([]);
  } finally {
    c.dispose();
    scope.stop();
  }
});
