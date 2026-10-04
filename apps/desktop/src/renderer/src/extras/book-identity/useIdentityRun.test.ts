import { effectScope, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEnvelope,
  chatAssistantProjectKey,
  type BookIdentityField,
  type ChatAssistantProjectRef,
  type ExtrasAgentRunRequest,
  type ExtrasAgentTask,
  type ExtrasAgentOutput,
  type ModelConfig,
  type SessionAbortAcceptedPayload,
  type SystemEventEnvelope
} from "@deepwrite/contracts/renderer";
import { useIdentityRun } from "./useIdentityRun";
import { bookIdentityRunning } from "../../stores/bookIdentityActivity";

const feedback = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));
vi.mock("../../ui-feedback", () => ({ uiMessage: feedback }));
const model: ModelConfig = {
  id: "test_model",
  label: "测试模型",
  provider: "test-provider",
  modelId: "test-chat",
  api: "openai-completions",
  baseUrl: "https://example.test/v1",
  reasoning: false,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["low"],
  temperatureOptions: [0.1, 0.7, 1],
  hasApiKey: false
};
const runtime = {
  provider: "faux",
  model: "test",
  mode: "local-faux" as const
};
let ordinal = 0;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const bookA: ChatAssistantProjectRef = {
    projectType: "short",
    projectId: `book_a_${++ordinal}`
  };
  const bookB: ChatAssistantProjectRef = {
    projectType: "long",
    projectId: `longbook_b_${ordinal}`
  };
  const book = ref<ChatAssistantProjectRef | null>(bookA);
  const field = ref<BookIdentityField>("title");
  const listeners = new Set<(event: SystemEventEnvelope) => void>();
  const run = vi.fn(async (request: ExtrasAgentRunRequest) => ({
    sessionId: request.sessionId,
    runId: `run_${request.sessionId}`,
    acceptedAt: "2026-10-02T00:00:00.000Z",
    runtime
  }));
  const abort = vi.fn(
    async (input: {
      sessionId: string;
      runId: string;
    }): Promise<SessionAbortAcceptedPayload> => ({
      ...input,
      abortedAt: "2026-10-02T00:00:00.000Z"
    })
  );
  const unsubscribe = vi.fn(
    (listener: (event: SystemEventEnvelope) => void) => {
      listeners.delete(listener);
    }
  );
  vi.stubGlobal("window", {
    deepwrite: {
      extrasAgents: { run },
      session: { abort },
      events: {
        subscribe: (listener: (event: SystemEventEnvelope) => void) => {
          listeners.add(listener);
          return () => unsubscribe(listener);
        }
      }
    }
  });
  const controller = useIdentityRun(book, field);
  function task(
    target = bookA,
    value: BookIdentityField = "title"
  ): Extract<
    ExtrasAgentTask,
    {
      agentId:
        "book-title-design" | "book-synopsis-design" | "book-cover-design";
    }
  > {
    const input = {
      book: target,
      jobId: `job_${ordinal}_${value}`,
      candidateCount: 2
    };
    if (value === "cover")
      return {
        agentId: "book-cover-design",
        profileId: "default",
        input: {
          ...input,
          imagesPerCandidate: 1,
          aspectRatio: "3:4",
          titleRendering: "overlay",
          autoRender: false
        }
      };
    return {
      agentId: value === "title" ? "book-title-design" : "book-synopsis-design",
      profileId: "default",
      input
    };
  }
  function emit(event: SystemEventEnvelope) {
    for (const listener of listeners) listener(event);
  }
  function delta(index: number, text: string, runId?: string) {
    const request = run.mock.calls[index]![0];
    emit(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId: request.sessionId,
          runId: runId ?? `run_${request.sessionId}`,
          messageId: "message_test",
          runtime,
          delta: text
        },
        { id: `delta_${ordinal}_${index}` }
      )
    );
  }
  function output(
    index: number,
    override: Partial<
      Extract<ExtrasAgentOutput, { kind: "book-identity-round" }>
    > = {}
  ) {
    const request = run.mock.calls[index]![0];
    const task = request.task;
    if (
      task.agentId !== "book-title-design" &&
      task.agentId !== "book-synopsis-design" &&
      task.agentId !== "book-cover-design"
    )
      throw new Error("Expected an identity task.");
    emit(
      createEnvelope(
        "extras_agent.output_updated",
        {
          sessionId: request.sessionId,
          runId: `run_${request.sessionId}`,
          agentId: task.agentId,
          jobId: task.input.jobId,
          runtime,
          output: {
            kind: "book-identity-round" as const,
            field:
              task.agentId === "book-title-design"
                ? ("title" as const)
                : task.agentId === "book-synopsis-design"
                  ? ("synopsis" as const)
                  : ("cover" as const),
            roundId: `round_${ordinal}_${index}`,
            bookKey: chatAssistantProjectKey(task.input.book),
            candidateCount: task.input.candidateCount,
            revision: 1,
            ...override
          }
        },
        { id: `output_${ordinal}_${index}` }
      )
    );
  }
  function complete(index: number, persisted = true) {
    const request = run.mock.calls[index]![0];
    if (persisted) output(index);
    emit(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId: request.sessionId,
          runId: `run_${request.sessionId}`,
          messageId: "message_test",
          runtime,
          role: "assistant" as const,
          content: "已完成",
          stopReason: "stop"
        },
        { id: `complete_${ordinal}_${index}` }
      )
    );
  }
  return {
    bookA,
    bookB,
    book,
    field,
    controller,
    task,
    run,
    abort,
    listeners,
    unsubscribe,
    delta,
    output,
    complete
  };
}
beforeEach(() => {
  feedback.warning.mockClear();
  feedback.error.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("identity run ownership", () => {
  it("keeps the original run and its events attached to the original book and field", async () => {
    const f = fixture();
    const finished = f.controller.start(f.task(), model, "off");
    await nextTick();
    f.delta(0, "短篇书名");
    expect(f.controller.state.value.output).toBe("短篇书名");
    f.book.value = f.bookB;
    f.field.value = "synopsis";
    expect(f.controller.state.value.status).toBe("idle");
    f.delta(0, "继续读取");
    expect(f.controller.state.value.output).toBe("");
    f.book.value = f.bookA;
    f.field.value = "title";
    expect(f.controller.state.value.output).toBe("短篇书名继续读取");
    f.delta(0, "其他运行内容", "run_other");
    expect(f.controller.state.value.output).toBe("短篇书名继续读取");
    f.complete(0);
    await finished;
    expect(f.controller.state.value.status).toBe("completed");
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("allows different fields and ignores a duplicate request for the same book and field", async () => {
    const f = fixture();
    const title = f.controller.start(f.task(), model, "off");
    await f.controller.start(f.task(), model, "off");
    const synopsis = f.controller.start(
      f.task(f.bookA, "synopsis"),
      model,
      "off"
    );
    await nextTick();
    expect(f.run).toHaveBeenCalledTimes(2);
    expect(f.controller.fieldBusy("title")).toBe(true);
    expect(f.controller.fieldBusy("synopsis")).toBe(true);
    f.delta(1, "简介正文");
    expect(f.controller.state.value.output).toBe("");
    f.field.value = "synopsis";
    expect(f.controller.state.value.output).toBe("简介正文");
    f.complete(0);
    f.complete(1);
    await Promise.all([title, synopsis]);
    expect(bookIdentityRunning.value).toBe(false);
  });
  it("keeps a run alive after leaving its component scope and restores the completed state", async () => {
    const f = fixture();
    const scope = effectScope();
    const page = scope.run(() => useIdentityRun(f.book, f.field))!;
    const finished = page.start(f.task(), model, "off");
    await nextTick();
    scope.stop();
    expect(f.abort).not.toHaveBeenCalled();
    expect(f.listeners.size).toBe(1);
    f.complete(0);
    await finished;
    const reopened = useIdentityRun(f.book, f.field);
    expect(reopened.state.value.status).toBe("completed");
    expect(f.listeners.size).toBe(0);
  });
  it("shows stopping until the abort receipt, then releases the field", async () => {
    const f = fixture();
    const finished = f.controller.start(f.task(), model, "off");
    await nextTick();
    const receipt = deferred<SessionAbortAcceptedPayload>();
    f.abort.mockReturnValueOnce(receipt.promise);
    const stopping = f.controller.stop();
    expect(f.controller.state.value.status).toBe("stopping");
    expect(f.controller.busy.value).toBe(true);
    const request = f.run.mock.calls[0]![0];
    receipt.resolve({
      sessionId: request.sessionId,
      runId: `run_${request.sessionId}`,
      abortedAt: "2026-10-02T00:00:00.000Z"
    });
    await stopping;
    await finished;
    expect(f.controller.state.value.status).toBe("stopped");
    expect(f.controller.fieldBusy("title")).toBe(false);
  });
  it("prechecks the selected model before calling the API", async () => {
    const f = fixture();
    await f.controller.start(f.task(), undefined, "off");
    expect(f.run).not.toHaveBeenCalled();
    expect(feedback.warning).toHaveBeenCalledTimes(1);
    expect(f.controller.state.value.status).toBe("idle");
  });
  it.each(["title", "synopsis", "cover"] as const)(
    "reports an error when %s finishes without a persisted result",
    async (field) => {
      const f = fixture();
      f.field.value = field;
      const finished = f.controller.start(f.task(f.bookA, field), model, "off");
      await nextTick();
      f.complete(0, false);
      await finished;
      expect(f.controller.state.value.status).toBe("error");
      expect(f.controller.state.value.error).toBeTruthy();
      expect(feedback.error).toHaveBeenCalledWith(
        f.controller.state.value.error
      );
      expect(f.controller.busy.value).toBe(false);
      expect(f.controller.fieldBusy(field)).toBe(false);
      expect(f.listeners.size).toBe(0);
      expect(bookIdentityRunning.value).toBe(false);
    }
  );
  it.each(["book", "field"] as const)(
    "rejects a saved output belonging to a different %s",
    async (mismatch) => {
      const f = fixture();
      const finished = f.controller.start(f.task(), model, "off");
      await nextTick();
      f.output(
        0,
        mismatch === "book"
          ? { bookKey: chatAssistantProjectKey(f.bookB) }
          : { field: "synopsis" }
      );
      f.complete(0, false);
      await finished;
      expect(f.controller.state.value.status).toBe("error");
      expect(feedback.error).toHaveBeenCalledTimes(1);
      expect(f.controller.fieldBusy("title")).toBe(false);
    }
  );
});
