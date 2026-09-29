import { effectScope, ref } from "vue";
import { expect, it, vi } from "vitest";
import type {
  DeepWriteApi,
  LongBookAnalysisPreset,
  LongBookAnalysisResult
} from "@deepwrite/contracts/renderer";
import { createLongAnalysisResultState } from "./analysis-result-state";
import type { LongBookAnalysisRunStatus } from "./useLongBookAnalysis";

it("keeps the last completed result and its save identity while another analysis runs or fails", async () => {
  const scope = effectScope();
  const createLibraryEntry = vi.fn<(input: unknown) => Promise<unknown>>(
    async () => ({})
  );
  const status = ref<LongBookAnalysisRunStatus>("idle");
  const pendingResult = ref<LongBookAnalysisResult | null>(null);
  let preset: LongBookAnalysisPreset = {
    id: "plot",
    name: "剧情预设",
    description: "测试",
    systemPrompt: "分析正文",
    output: { domain: "material", kind: "plot", stageId: "pacing" }
  };
  const state = scope.run(() =>
    createLongAnalysisResultState({
      api: () =>
        ({ catalog: { createLibraryEntry } }) as unknown as DeepWriteApi,
      status,
      pendingResult,
      preset: () => preset
    })
  )!;
  try {
    state.setPendingContext("第一本 · 第 1–3 章");
    status.value = "running";
    pendingResult.value = {
      name: "第一份结果",
      description: "用途",
      content: "分析"
    };
    expect(state.result.value).toBeNull();
    status.value = "completed";
    expect(state.result.value?.name).toBe("第一份结果");
    expect(state.resultIsPrevious.value).toBe(false);
    state.result.value!.content = "用户编辑后的结果";
    preset.name = "原预设后来改名";
    expect(state.resultPreset.value?.name).toBe("剧情预设");
    preset = {
      ...preset,
      id: "next",
      name: "人物预设",
      output: { domain: "material", kind: "character", stageId: "character" }
    };
    state.setPendingContext("第二本 · 第 4–5 章");
    status.value = "running";
    pendingResult.value = {
      name: "新结果草稿",
      description: "新用途",
      content: "尚未完成"
    };
    expect(state.result.value?.content).toBe("用户编辑后的结果");
    expect(state.resultIsPrevious.value).toBe(true);
    status.value = "error";
    await state.persistResult({
      libraryId: "material-library",
      baseProjectRevision: 9
    });
    expect(createLibraryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "material",
        libraryId: "material-library",
        stageId: "pacing",
        title: "第一份结果",
        baseProjectRevision: 9
      })
    );
    expect(createLibraryEntry.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        content: expect.stringContaining("用户编辑后的结果")
      })
    );
    expect(state.resultContext.value).toBe("第一本 · 第 1–3 章");
    status.value = "running";
    status.value = "completed";
    expect(state.result.value?.name).toBe("新结果草稿");
    expect(state.resultPreset.value?.name).toBe("人物预设");
    expect(state.resultContext.value).toBe("第二本 · 第 4–5 章");
  } finally {
    state.dispose();
    scope.stop();
  }
});
