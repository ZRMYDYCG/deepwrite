import { afterEach, expect, it, vi } from "vitest";
import {
  DEFAULT_DECOMPOSITION_PROFILE,
  type DeepWriteApi,
  type LongBookDecompositionJob,
  type ModelConfig
} from "@deepwrite/contracts/renderer";
import {
  createExtrasAgentsFake,
  runEvent
} from "../agent-runtime/extrasAgent.test-support";
import { createDecompositionEngine } from "./engine";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const model: ModelConfig = {
  id: "test",
  label: "合成模型",
  provider: "test",
  modelId: "test",
  api: "openai-completions",
  baseUrl: "https://example.test",
  reasoning: false,
  hasApiKey: true,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["low"],
  temperatureOptions: [0.1, 0.7, 1],
  contextWindow: 128_000,
  maxTokens: 8192
};
function fixture(selectedModel = model) {
  const now = new Date().toISOString();
  let stored: LongBookDecompositionJob = {
    schemaVersion: 1,
    id: "ldjob_ui",
    createdAt: now,
    updatedAt: now,
    mode: "materials",
    outputVersion: 1,
    autoContinue: false,
    profile: DEFAULT_DECOMPOSITION_PROFILE,
    source: {
      sourceId: "source_ui",
      sourceRevision: 1,
      title: "合成样书",
      fingerprint: "a".repeat(64),
      confirmationId: "confirm_ui",
      confirmedAt: now,
      chapterCount: 1,
      characterCount: 5,
      range: { start: 1, end: 1 }
    },
    targetSelection: {
      kind: "material-group",
      action: "create",
      title: "合成资料"
    },
    target: {
      kind: "material-group",
      groupId: "group_ui",
      libraryIds: {
        character: "c",
        plot: "p",
        draft: "d",
        other: "o",
        gimmick: "g"
      },
      baseRevisions: {},
      state: "ready"
    },
    models: {
      reading: {
        modelId: model.id,
        thinkingLevel: "off",
        contextWindow: 128_000,
        maxTokens: 8192
      },
      integration: {
        modelId: model.id,
        thinkingLevel: "off",
        contextWindow: 128_000,
        maxTokens: 8192
      }
    },
    chunks: [
      {
        id: "chunk:1",
        chapterIds: ["chapter_ui"],
        startOrder: 1,
        endOrder: 1,
        estimatedTokens: 5
      }
    ],
    chronicleSegments: [],
    phase: "read",
    status: "idle",
    units: {
      "chunk:1": {
        phase: "read",
        status: "pending",
        attempts: 0,
        inputRevision: "a".repeat(64),
        dependencies: [],
        outputRefs: [],
        receiptIds: [],
        updatedAt: now
      }
    }
  };
  const extras = createExtrasAgentsFake();
  const control = vi.fn<DeepWriteApi["longBookDecomposition"]["control"]>(
    async (input) => {
      if (input.action === "resume") stored.status = "idle";
      if (input.action === "stop") {
        stored.status = "stopped";
        delete stored.activeAttemptId;
      }
      if (input.action === "finish-package") {
        expect(input.attemptId).toBe("attempt_ui");
        stored.units["chunk:1"]!.status = "done";
        stored.status = "idle";
      }
      if (input.action === "advance") stored.phase = "registry_review";
      return structuredClone(stored);
    }
  );
  const getJob = vi.fn(async () => structuredClone(stored));
  const api = {
    extrasAgents: extras.extrasAgents,
    session: { abort: vi.fn(async () => undefined) },
    longBookDecomposition: { control, getJob }
  } as unknown as DeepWriteApi;
  const engine = createDecompositionEngine(
    () => api,
    () => [selectedModel]
  );
  engine.job.value = structuredClone(stored);
  function accept() {
    extras.run.mockImplementation(async (request) => {
      stored.status = "running";
      stored.activeAttemptId = "attempt_ui";
      stored.units["chunk:1"]!.attemptId = "attempt_ui";
      setTimeout(
        () =>
          engine.handleEvent(
            runEvent("agent.message_completed", request, {
              content: "已保存",
              stopReason: "stop"
            })
          ),
        0
      );
      return {
        sessionId: request.sessionId,
        runId: `${request.sessionId}-run`,
        acceptedAt: now,
        runtime: { provider: "test", model: "test", mode: "local-faux" }
      };
    });
  }
  return {
    engine,
    extras,
    control,
    getJob,
    accept,
    api,
    stored: () => stored,
    replace: (job: LongBookDecompositionJob) => {
      stored = job;
    }
  };
}

it("名额不足时等待并重试，不增加单元失败次数，名册确认时停下", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.accept();
  f.extras.run.mockRejectedValueOnce({
    code: "agent.extras_capacity_reached",
    message: "名额暂满"
  });
  const run = f.engine.run();
  await vi.advanceTimersByTimeAsync(0);
  expect(f.engine.waitingForSlot.value).toBe(true);
  expect(f.stored().units["chunk:1"]!.attempts).toBe(0);
  await vi.advanceTimersByTimeAsync(5001);
  await run;
  expect(f.extras.run).toHaveBeenCalledTimes(2);
  expect(f.engine.job.value?.phase).toBe("registry_review");
  expect(f.engine.error.value).toBeNull();
  // The refused attempt delegated nothing, so it leaves no empty package.
  expect(f.engine.subtasks.packages.value).toHaveLength(1);
  expect(
    f.control.mock.calls.filter(([input]) => input.action === "finish-package")
  ).toHaveLength(1);
  f.engine.dispose();
});

it("工作包里的子任务事件进入看板，包结束后收尾", async () => {
  const f = fixture();
  f.accept();
  const base = f.extras.run.getMockImplementation()!;
  const at = (n: number) =>
    new Date(1_700_000_000_000 + n * 1_000).toISOString();
  const child = {
    parentToolCallId: "call",
    subagentRunId: "sub_1",
    subagentId: "reader",
    name: "通读员",
    runtime: { provider: "test", model: "test", mode: "provider" }
  };
  f.extras.run.mockImplementation(async (request) => {
    const send = (n: number, type: string, payload: Record<string, unknown>) =>
      f.engine.handleEvent({
        ...runEvent(type, request, payload),
        id: `event_${n}`,
        timestamp: at(n)
      });
    // Registered before the base mock's own completion timer.
    setTimeout(() => {
      send(1, "subagent.planned", {
        parentToolCallId: "call",
        tasks: [
          {
            index: 0,
            key: "t1",
            dependsOn: [],
            subagentId: "reader",
            name: "通读员",
            task: "chunk:1",
            runtime: child.runtime
          }
        ]
      });
      send(2, "subagent.started", {
        ...child,
        task: "chunk:1",
        batchTask: { index: 0, key: "t1", dependsOn: [] }
      });
      send(3, "subagent.completed", {
        ...child,
        status: "completed",
        summary: "已保存",
        batchTask: { index: 0, key: "t1", dependsOn: [] }
      });
    }, 0);
    return base(request);
  });
  await f.engine.run();
  const [pkg] = f.engine.subtasks.packages.value;
  expect(pkg).toMatchObject({ phase: "read", outcome: "completed" });
  expect(pkg!.unitIds).toEqual(["chunk:1"]);
  expect(pkg!.message.subagentRuns).toHaveLength(1);
  expect(pkg!.message.subagentRuns![0]).toMatchObject({
    name: "通读员",
    status: "completed",
    summary: "已保存"
  });
  expect(f.engine.subtasks.parent.value).toEqual({ kind: "idle" });
  // Another task starts with an empty board.
  f.engine.job.value = null;
  await Promise.resolve();
  expect(f.engine.subtasks.packages.value).toHaveLength(0);
  f.engine.dispose();
});

it("工作包被接受后立即显示运行中，不等第一章保存", async () => {
  const f = fixture();
  let accepted: { sessionId: string } | undefined;
  f.extras.run.mockImplementation(async (request) => {
    accepted = request;
    Object.assign(f.stored(), {
      status: "running",
      activeAttemptId: "attempt_ui"
    });
    Object.assign(f.stored().units["chunk:1"]!, {
      status: "running",
      attemptId: "attempt_ui"
    });
    return {
      sessionId: request.sessionId,
      runId: `${request.sessionId}-run`,
      acceptedAt: new Date().toISOString(),
      runtime: { provider: "test", model: "test", mode: "local-faux" }
    };
  });
  const run = f.engine.run();
  await vi.waitFor(() =>
    expect(f.engine.job.value?.units["chunk:1"]?.status).toBe("running")
  );
  expect(f.control.mock.calls.map(([input]) => input.action)).toEqual([
    "resume"
  ]);
  f.engine.handleEvent(
    runEvent("agent.message_completed", accepted!, {
      content: "已保存",
      stopReason: "stop"
    })
  );
  await run;
  expect(f.engine.job.value?.phase).toBe("registry_review");
  f.engine.dispose();
});

it("等待名额期间停止，不派新工作包且保持检查点", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.extras.run.mockRejectedValue({ code: "agent.capacity_reached" });
  const run = f.engine.run();
  await vi.advanceTimersByTimeAsync(0);
  await f.engine.stop();
  await run;
  await vi.advanceTimersByTimeAsync(6000);
  expect(f.extras.run).toHaveBeenCalledTimes(1);
  expect(f.engine.waitingForSlot.value).toBe(false);
  expect(f.stored().units["chunk:1"]!.attempts).toBe(0);
  expect(f.engine.job.value?.status).toBe("stopped");
  f.engine.dispose();
});

it("异步旧任务刷新返回时不能替换后来选中的任务", async () => {
  const f = fixture();
  let resolve!: (job: LongBookDecompositionJob) => void;
  f.getJob.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const refreshing = f.engine.refresh();
  f.engine.job.value = { ...f.stored(), id: "ldjob_new_selection" };
  resolve(f.stored());
  await refreshing;
  expect(f.engine.job.value.id).toBe("ldjob_new_selection");
  f.engine.dispose();
});

it("恢复发现用户修改冲突时，通过既有错误通知机制提示处理选择", async () => {
  const f = fixture();
  f.stored().units["chunk:1"]!.status = "conflict";
  f.stored().units["chunk:1"]!.lastError =
    "生成条目已被编辑，请选择保留内容或重新生成。";
  await f.engine.refresh();
  expect(f.engine.error.value).toBe(f.stored().units["chunk:1"]!.lastError);
  expect(f.extras.run).not.toHaveBeenCalled();
  f.engine.dispose();
});

it("标准模型没有手填窗口时，以运行时目录容量预检并继续拆解", async () => {
  vi.useFakeTimers();
  const { contextWindow: _window, maxTokens: _output, ...standard } = model;
  const f = fixture(standard);
  const resolveCapacity = vi.fn(async (input) => {
    expect(input).not.toHaveProperty("hasApiKey");
    structuredClone(input);
    return { modelId: model.id, contextWindow: 128_000, maxTokens: 8192 };
  });
  f.api.models = { resolveCapacity } as unknown as DeepWriteApi["models"];
  f.accept();
  const run = f.engine.run();
  await vi.advanceTimersByTimeAsync(1);
  await run;
  expect(resolveCapacity).toHaveBeenCalledTimes(1);
  expect(f.extras.run).toHaveBeenCalledTimes(1);
  expect(f.engine.job.value?.phase).toBe("registry_review");
  expect(f.engine.error.value).toBeNull();
  f.engine.dispose();
});

it("查询模型容量期间停止，不派发迟到的工作包", async () => {
  const { contextWindow: _window, maxTokens: _output, ...standard } = model;
  const f = fixture(standard);
  let resolve!: (capacity: {
    modelId: string;
    contextWindow: number;
    maxTokens: number;
  }) => void;
  const resolveCapacity = vi.fn(
    () => new Promise<Parameters<typeof resolve>[0]>((done) => (resolve = done))
  );
  f.api.models = { resolveCapacity } as unknown as DeepWriteApi["models"];
  const run = f.engine.run();
  await vi.waitFor(() => expect(resolveCapacity).toHaveBeenCalledTimes(1));
  await f.engine.stop();
  resolve({ modelId: model.id, contextWindow: 128_000, maxTokens: 8192 });
  await run;
  expect(f.extras.run).not.toHaveBeenCalled();
  expect(f.engine.job.value?.status).toBe("stopped");
  f.engine.dispose();
});
