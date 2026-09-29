import { describe, it, expect, vi } from "vitest";
import type {
  DeepWriteApi,
  ExtrasAgentRunRequest,
  ModelConfig,
  ShortBookAnalysisPreset,
  ShortBookAnalysisSource,
  SystemEventEnvelope
} from "@deepwrite/contracts/renderer";
import {
  createExtrasAgentsFake,
  outputEvent,
  runEvent
} from "../agent-runtime/extrasAgent.test-support";
import { createShortAnalysisRun } from "./analysis-run";
const model = {
  id: "model",
  contextWindow: 100000,
  maxTokens: 16000,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["off"]
} as ModelConfig;
const preset: ShortBookAnalysisPreset = {
  id: "preset",
  name: "综合",
  description: "测试",
  systemPrompt: "分析全文",
  selectionMode: "multiple",
  output: { domain: "material", kind: "plot", stageId: "pacing" }
};
const book: ShortBookAnalysisSource = {
  id: "book",
  title: "来信",
  text: "第一章 开始\n第二章 结局",
  kind: "paste",
  importedAt: "2026-01-01T00:00:00.000Z"
};
function fixture() {
  const fake = createExtrasAgentsFake();
  const abort = vi.fn(async () => ({}));
  const api = {
    session: { abort },
    extrasAgents: fake.extrasAgents
  } as unknown as DeepWriteApi;
  return { prompt: fake.run, abort, run: createShortAnalysisRun(() => api) };
}
function event(
  type: string,
  request: ExtrasAgentRunRequest,
  body: Record<string, unknown> = {}
): SystemEventEnvelope {
  return runEvent(type, request, body);
}
function shortInput(request: ExtrasAgentRunRequest) {
  if (request.task.agentId !== "short-book-analysis")
    throw new Error("unexpected agent");
  return request.task.input;
}
const submitted = {
  name: "联合结果",
  description: "用于提炼写作方法。",
  content: "分析两本的异同"
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
describe("short analysis run", () => {
  it("records actual stage changes once per stream with timestamps and retains public output on failure", async () => {
    const f = fixture();
    f.run.start([book], preset, model, "off");
    await flush();
    const input = f.prompt.mock.calls[0]![0];
    expect(f.run.entries.value[0]?.detail).toContain(book.title);
    for (let i = 0; i < 3; i++)
      f.run.handleEvent(
        event("agent.thinking_delta", input, { delta: "private reasoning" })
      );
    expect(
      f.run.entries.value.filter((entry) => entry.title === "模型正在分析全文")
    ).toHaveLength(1);
    f.run.handleEvent(
      event("agent.message_delta", input, { delta: "公开分析" })
    );
    f.run.handleEvent(event("agent.message_delta", input, { delta: "说明" }));
    expect(f.run.activity.value).toBe("模型正在输出分析说明");
    expect(
      f.run.entries.value.filter(
        (entry) => entry.title === f.run.activity.value
      )
    ).toHaveLength(1);
    f.run.handleEvent(event("agent.error", input, { message: "测试请求失败" }));
    await flush();
    expect(f.run.entries.value.at(-1)?.tone).toBe("error");
    expect(f.run.liveOutput.value).toBe("公开分析说明");
    expect(
      f.run.entries.value.every((entry) =>
        Number.isFinite(Date.parse(entry.createdAt))
      )
    ).toBe(true);
    expect(JSON.stringify(f.run.entries.value)).not.toContain(
      "private reasoning"
    );
    f.run.retry();
    expect(f.run.liveOutput.value).toBe("");
    expect(f.run.entries.value.some((entry) => entry.tone === "error")).toBe(
      false
    );
  });
  it("retains a non-streamed public response when no structured result was submitted", async () => {
    const f = fixture();
    f.run.start([book], preset, model, "off");
    await flush();
    f.run.handleEvent(
      event("agent.message_completed", f.prompt.mock.calls[0]![0], {
        content: "供用户查看的公开说明"
      })
    );
    await flush();
    expect(f.run.liveOutput.value).toBe("供用户查看的公开说明");
    expect(f.run.status.value).toBe("error");
  });
  it("sends one immutable complete request and publishes only a completed structured result", async () => {
    const f = fixture();
    const books = [{ ...book }, { ...book, id: "book2", title: "第二本" }];
    const mutable = { ...preset };
    f.run.start(books, mutable, model, "off");
    const input = f.prompt.mock.calls[0]![0];
    books[0]!.text = "修改";
    mutable.name = "修改";
    expect(input.task).toMatchObject({
      agentId: "short-book-analysis",
      profileId: "preset"
    });
    expect(shortInput(input).books[0]?.text).toBe(book.text);
    expect(f.run.preset.value?.name).toBe("综合");
    await flush();
    f.run.handleEvent(
      outputEvent(input, {
        kind: "book-analysis-note",
        unitId: "unit",
        note: { text: "中间笔记" }
      })
    );
    expect(f.run.result.value).toBeNull();
    f.run.handleEvent(
      outputEvent(input, { kind: "book-analysis-result", result: submitted })
    );
    expect(f.run.result.value).toBeNull();
    f.run.handleEvent(event("agent.message_completed", input));
    await flush();
    expect(f.run.status.value).toBe("completed");
    expect(f.run.result.value?.name).toBe("联合结果");
    expect(f.prompt).toHaveBeenCalledTimes(1);
  });
  it("retains the completed result and its identity through edits, failed reruns and successful replacement", async () => {
    const f = fixture();
    f.run.start([book], preset, model, "off");
    await flush();
    const first = f.prompt.mock.calls[0]![0];
    f.run.handleEvent(
      outputEvent(first, { kind: "book-analysis-result", result: submitted })
    );
    f.run.handleEvent(event("agent.message_completed", first));
    await flush();
    f.run.result.value!.content = "用户整理后的结果";
    f.run.clear();
    expect(f.run.result.value?.content).toBe("用户整理后的结果");
    expect(f.run.resultIsPrevious.value).toBe(true);
    const nextPreset: ShortBookAnalysisPreset = {
      ...preset,
      id: "next",
      name: "新任务",
      output: {
        domain: "material" as const,
        kind: "plot" as const,
        stageId: "pacing"
      }
    };
    f.run.start([{ ...book, title: "另一篇" }], nextPreset, model, "off");
    await flush();
    expect(f.run.resultPreset.value?.name).toBe("综合");
    expect(f.run.resultContext.value).toBe("来信");
    const failed = f.prompt.mock.calls[1]![0];
    f.run.handleEvent(event("agent.error", failed, { message: "测试失败" }));
    await flush();
    expect(f.run.result.value?.content).toBe("用户整理后的结果");
    f.run.retry();
    await flush();
    const retried = f.prompt.mock.calls[2]![0];
    f.run.handleEvent(
      outputEvent(retried, {
        kind: "book-analysis-result",
        result: { ...submitted, name: "新结果" }
      })
    );
    expect(f.run.result.value?.name).toBe(submitted.name);
    f.run.handleEvent(event("agent.message_completed", retried));
    await flush();
    expect(f.run.result.value?.name).toBe("新结果");
    expect(f.run.resultPreset.value?.name).toBe("新任务");
    expect(f.run.resultIsPrevious.value).toBe(false);
  });
  it("does not issue requests for oversized or invalid selections", () => {
    const f = fixture();
    expect(() =>
      f.run.start(
        [book, { ...book, id: "b" }],
        { ...preset, selectionMode: "single" },
        model,
        "off"
      )
    ).toThrow("一本");
    expect(() =>
      f.run.start(
        [{ ...book, text: "文".repeat(200000) }],
        preset,
        model,
        "off"
      )
    ).toThrow("上下文");
    expect(f.prompt).not.toHaveBeenCalled();
  });
  it("rejects plain model messages and retries the complete task with a fresh session", async () => {
    const f = fixture();
    f.run.start([book], preset, model, "off");
    await flush();
    const input = f.prompt.mock.calls[0]![0];
    f.run.handleEvent(
      event("agent.message_completed", input, { content: "普通回复" })
    );
    await flush();
    expect(f.run.status.value).toBe("error");
    expect(f.run.result.value).toBeNull();
    f.run.retry();
    await flush();
    const next = f.prompt.mock.calls[1]![0];
    expect(next.sessionId).not.toBe(input.sessionId);
    expect(next.task).toEqual(input.task);
    f.run.handleEvent(
      outputEvent(input, {
        kind: "book-analysis-result",
        result: { ...submitted, name: "旧结果" }
      })
    );
    f.run.handleEvent(event("agent.message_completed", input));
    await flush();
    expect(f.run.result.value).toBeNull();
    expect(f.run.status.value).toBe("running");
  });
  it("stops before prompt acceptance and ignores late output", async () => {
    const f = fixture();
    let accept!: (input: Awaited<ReturnType<typeof f.prompt>>) => void;
    f.prompt.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        })
    );
    f.run.start([book], preset, model, "off");
    const input = f.prompt.mock.calls[0]![0];
    await f.run.stop();
    expect(f.run.status.value).toBe("stopping");
    accept({
      sessionId: input.sessionId,
      runId: `${input.sessionId}-run`,
      acceptedAt: new Date().toISOString(),
      runtime: { provider: "test", model: "test", mode: "provider" }
    });
    await flush();
    await flush();
    expect(f.abort).toHaveBeenCalledTimes(1);
    expect(f.run.status.value).toBe("stopped");
    f.run.handleEvent(event("agent.message_completed", input));
    expect(f.run.status.value).toBe("stopped");
  });
  it("settles a terminal event arriving while stop is pending", async () => {
    const f = fixture();
    let reject!: (error: Error) => void;
    f.abort.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        })
    );
    f.run.start([book], preset, model, "off");
    await flush();
    const input = f.prompt.mock.calls[0]![0];
    const stop = f.run.stop();
    f.run.handleEvent(event("agent.message_completed", input));
    reject(new Error("Run already ended"));
    await stop;
    expect(f.run.status.value).toBe("stopped");
    expect(f.run.canRetry.value).toBe(true);
  });
  it("reports agent worker restarts instead of remaining busy", async () => {
    const f = fixture();
    f.run.start([book], preset, model, "off");
    await flush();
    f.run.handleEvent({
      type: "system.worker_restarting",
      payload: {
        worker: "agent",
        reason: "test restart",
        detectedAt: new Date().toISOString()
      }
    } as SystemEventEnvelope);
    await flush();
    expect(f.run.status.value).toBe("error");
    expect(f.run.error.value).toContain("重启");
    expect(f.run.canRetry.value).toBe(true);
  });
});
