import {
  localizedTextRef,
  localizedNullableTextRef
} from "../analysis-ui/localized-text";
import { ref, shallowRef } from "vue";
import type {
  DeepWriteApi,
  ExtrasAgentRunRequest,
  LongBookAnalysisPreset,
  LongBookAnalysisSource,
  ModelConfig,
  SystemEventEnvelope
} from "@deepwrite/contracts/renderer";
import { describe, expect, it, vi } from "vitest";
import {
  createExtrasAgentsFake,
  outputEvent,
  runEvent
} from "../agent-runtime/extrasAgent.test-support";
import { LongBookAnalysisPipeline } from "./analysis-pipeline";
import type { LongBookAnalysisPipelineState } from "./analysis-pipeline-types";
import { useLongBookAnalysis } from "./useLongBookAnalysis";

function fixture() {
  const fake = createExtrasAgentsFake();
  const prompts = fake.run.mock.calls.map(([request]) => request);
  fake.run.mockImplementation(async (request) => {
    prompts.push(request);
    return {
      sessionId: request.sessionId,
      runId: `${request.sessionId}-run`,
      acceptedAt: new Date().toISOString(),
      runtime: { provider: "test", model: "test", mode: "provider" as const }
    };
  });
  const abort = vi.fn(async () => ({
    sessionId: "session",
    runId: "run",
    abortedAt: new Date().toISOString()
  }));
  const api = {
    session: { abort },
    extrasAgents: fake.extrasAgents
  } as unknown as DeepWriteApi;
  const model = {
    id: "model-1",
    contextWindow: 100_000,
    maxTokens: 16_000,
    defaultThinkingLevel: "medium",
    thinkingLevelOptions: ["low", "medium", "high"]
  } as ModelConfig;
  const state: LongBookAnalysisPipelineState = {
    status: ref("idle"),
    phase: ref(null),
    completedUnits: ref(0),
    estimatedUnits: ref(0),
    error: localizedNullableTextRef(),
    result: ref(null),
    processEntries: ref([]),
    currentActivity: localizedTextRef(),
    liveOutput: ref("")
  };
  return {
    api,
    model,
    prompts,
    abort,
    state,
    pipeline: new LongBookAnalysisPipeline(
      () => api,
      shallowRef([model]),
      state
    )
  };
}

const source: LongBookAnalysisSource = {
  id: "source-1",
  kind: "txt",
  name: "测试长篇.txt",
  diagnostics: [],
  chapters: [
    {
      id: "chapter-1",
      order: 1,
      title: "第一章",
      sourceName: "测试长篇.txt",
      text: "雨夜来信。".repeat(200),
      charCount: 1_000
    }
  ]
};

const preset: LongBookAnalysisPreset = {
  id: "plot-structure",
  name: "剧情结构",
  description: "拆解剧情结构。",
  systemPrompt: "依据章节证据提炼剧情结构。",
  output: { domain: "material", kind: "plot", stageId: "pacing" }
};

function event(
  type: string,
  request: ExtrasAgentRunRequest,
  payload: Record<string, unknown>
): SystemEventEnvelope {
  return runEvent(type, request, payload);
}

function longInput(request: ExtrasAgentRunRequest) {
  if (request.task.agentId !== "long-book-analysis")
    throw new Error("unexpected agent");
  return request.task.input;
}

async function waitForPrompt(prompts: ExtrasAgentRunRequest[], count: number) {
  await vi.waitFor(() => expect(prompts).toHaveLength(count));
  return prompts[count - 1]!;
}

describe("long-book analysis pipeline checkpoints", () => {
  it("clears the imported source and retained output after stopping the run", async () => {
    const { api, model, prompts } = fixture();
    const controller = useLongBookAnalysis({ api: () => api });
    controller.setConfiguredModels([model]);
    controller.source.value = source;
    controller.presets.value = [preset];
    try {
      await controller.start({
        presetIds: [preset.id],
        startOrder: 1,
        endOrder: 1
      });
      await waitForPrompt(prompts, 1);
      expect(() => controller.resetWorkspace()).toThrow();
      expect(controller.source.value).toEqual(source);
      await controller.stop();
      controller.resetWorkspace();
      expect(controller.source.value).toBeNull();
      expect(controller.batch.items.value).toEqual([]);
      expect(controller.batch.results.value).toEqual([]);
      expect(controller.status.value).toBe("idle");
      expect(controller.batch.canRetry.value).toBe(false);
      expect(controller.selectedModelId.value).toBe(model.id);
    } finally {
      controller.dispose();
    }
  });
  it("enables the page's continue action after an initially idle task stops", async () => {
    const { api, model, prompts } = fixture();
    const controller = useLongBookAnalysis({ api: () => api });
    controller.setConfiguredModels([model]);
    controller.source.value = source;
    controller.presets.value = [preset];
    try {
      expect(controller.batch.canRetry.value).toBe(false);
      await controller.start({
        presetIds: [preset.id],
        startOrder: 1,
        endOrder: 1
      });
      const first = await waitForPrompt(prompts, 1);
      expect(controller.batch.canRetry.value).toBe(false);
      await controller.stop();
      await vi.waitFor(() => expect(controller.status.value).toBe("stopped"));
      expect(controller.batch.canRetry.value).toBe(true);
      expect(controller.batch.retryFailed()).toBe(true);
      const resumed = await waitForPrompt(prompts, 2);
      expect(longInput(resumed).jobId).toBe(longInput(first).jobId);
      expect(controller.batch.canRetry.value).toBe(false);
    } finally {
      controller.dispose();
    }
  });
  it("runs each selected preset as its own pipeline and keeps every result", async () => {
    const { api, model, prompts } = fixture();
    const character: LongBookAnalysisPreset = {
      ...preset,
      id: "character",
      name: "人物",
      output: { domain: "material", kind: "character", stageId: "character" }
    };
    const controller = useLongBookAnalysis({ api: () => api });
    controller.setConfiguredModels([model]);
    controller.source.value = source;
    controller.presets.value = [preset, character];
    try {
      await expect(
        controller.start({
          presetIds: ["missing"],
          startOrder: 1,
          endOrder: 1
        })
      ).rejects.toThrow("预设");
      await controller.start({
        presetIds: [character.id, preset.id],
        startOrder: 1,
        endOrder: 1
      });
      await waitForPrompt(prompts, 2);
      expect(prompts.map((request) => request.task)).toMatchObject([
        { profileId: "character" },
        { profileId: "plot-structure" }
      ]);
      expect(controller.batch.counts.value.running).toBe(2);
      for (const batch of prompts.slice(0, 2)) {
        controller.handleEvent(
          outputEvent(batch, {
            kind: "book-analysis-note",
            unitId: longInput(batch).unitId,
            note: { text: "章节笔记。" }
          })
        );
        controller.handleEvent(
          event("agent.message_completed", batch, { content: "批次完成。" })
        );
      }
      await waitForPrompt(prompts, 4);
      for (const final of prompts.slice(2, 4)) {
        const name =
          final.task.profileId === "character" ? "人物结果" : "剧情结果";
        controller.handleEvent(
          outputEvent(final, {
            kind: "book-analysis-result",
            unitId: longInput(final).unitId,
            result: { name, description: "用途。", content: `# ${name}` }
          })
        );
        controller.handleEvent(
          event("agent.message_completed", final, { content: "完成。" })
        );
      }
      await vi.waitFor(() => expect(controller.status.value).toBe("completed"));
      expect(
        controller.batch.results.value.map((entry) => entry.result.name)
      ).toEqual(["人物结果", "剧情结果"]);
      expect(controller.batch.context.value).toBe("测试长篇.txt · 第 1–1 章");
    } finally {
      controller.dispose();
    }
  });
  it("keeps a failed batch checkpoint and retries through the final result", async () => {
    const { pipeline, prompts, state } = fixture();
    pipeline.start(source, preset, {
      startOrder: 1,
      endOrder: 1,
      modelId: "model-1",
      thinkingLevel: "high"
    });
    const failed = await waitForPrompt(prompts, 1);
    expect(failed.thinkingLevel).toBe("high");
    pipeline.handleEvent(
      event("agent.error", failed, { message: "temporary", code: "test" })
    );
    await vi.waitFor(() => expect(state.status.value).toBe("error"));

    expect(pipeline.retry()).toBe(true);
    const batch = await waitForPrompt(prompts, 2);
    pipeline.handleEvent(
      outputEvent(batch, {
        kind: "book-analysis-note",
        unitId: longInput(batch).unitId,
        note: { text: "保留章节证据的中间笔记。" }
      })
    );
    pipeline.handleEvent(
      event("agent.message_completed", batch, {
        role: "assistant",
        content: "批次分析完成。"
      })
    );

    const final = await waitForPrompt(prompts, 3);
    expect(longInput(final).phase).toBe("final");
    pipeline.handleEvent(
      outputEvent(final, {
        kind: "book-analysis-result",
        unitId: longInput(final).unitId,
        result: {
          name: "剧情结构",
          description: "用于提炼写作方法。",
          content: "# 可编辑结果"
        }
      })
    );
    expect(state.result.value?.content).toBe("# 可编辑结果");
    pipeline.handleEvent(
      event("agent.message_completed", final, {
        role: "assistant",
        content: "正式结果已生成。"
      })
    );

    await vi.waitFor(() => expect(state.status.value).toBe("completed"));
    expect(state.result.value?.content).toBe("# 可编辑结果");
    expect(state.processEntries.value.at(-1)?.title).toBe("当前预设执行完成");
  });

  it("aborts the active run and preserves it for resume", async () => {
    const { pipeline, prompts, state, abort } = fixture();
    pipeline.start(source, preset, {
      startOrder: 1,
      endOrder: 1,
      modelId: "model-1"
    });
    const active = await waitForPrompt(prompts, 1);
    await pipeline.stop();
    expect(abort).toHaveBeenCalled();
    pipeline.handleEvent(
      event("agent.error", active, { message: "aborted", code: "aborted" })
    );
    await vi.waitFor(() => expect(state.status.value).toBe("stopped"));
    expect(pipeline.hasJob).toBe(true);
  });

  it("runs only the selected preset without requiring a target library", async () => {
    const { pipeline, prompts, state } = fixture();
    pipeline.start(source, preset, {
      startOrder: 1,
      endOrder: 1,
      modelId: "model-1"
    });

    const active = await waitForPrompt(prompts, 1);
    expect(active.task).toMatchObject({
      agentId: "long-book-analysis",
      profileId: preset.id
    });
    expect(longInput(active)).not.toHaveProperty("presetId");
    expect(state.processEntries.value[0]?.detail).toContain("仅运行当前预设");
  });
});
