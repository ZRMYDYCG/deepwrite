import { afterEach } from "vitest";
import {
  createDeferredApi,
  createEnvelope,
  describe,
  document,
  eventOptions,
  expect,
  it,
  runtime,
  useAgentConversation,
  vi
} from "./useAgentConversation.test-support";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agent conversation controller: parallel subagent text", () => {
  it("applies the text of parallel children once per frame and in order", async () => {
    const frames: Array<(timestamp: number) => void> = [];
    const requestFrame = vi.fn((callback: (timestamp: number) => void) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "让两个子智能体并行检查";
    const sessionId = controller.sessionId.value;
    const runId = "run_parallel_text";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    let sequence = 0;
    const child = (subagentRunId: string) => ({
      sessionId,
      runId,
      parentToolCallId: "spawn_parallel",
      subagentRunId,
      subagentId: "reviewer",
      name: subagentRunId,
      runtime
    });
    const send = (
      type: "subagent.started" | "subagent.activity",
      payload: Record<string, unknown>
    ) =>
      controller.handleEvent(
        createEnvelope(
          type,
          payload as never,
          eventOptions(sessionId, runId, `evt_parallel_${(sequence += 1)}`)
        )
      );
    const text = (
      subagentRunId: string,
      type: "thinking_delta" | "message_delta",
      delta: string
    ) =>
      send("subagent.activity", {
        ...child(subagentRunId),
        activity: { type, delta }
      });
    send("subagent.started", { ...child("child_a"), task: "检查第一章" });
    send("subagent.started", { ...child("child_b"), task: "检查第二章" });

    for (const index of [1, 2, 3]) {
      text("child_a", "thinking_delta", `甲思考${index}。`);
      text("child_b", "thinking_delta", `乙思考${index}。`);
    }
    const runs = () => controller.messages.value.at(-1)?.subagentRuns ?? [];
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(runs().map((run) => run.thinking)).toEqual([undefined, undefined]);
    // Switching to handoff text settles that child's thinking only.
    text("child_a", "message_delta", "甲交接。");
    expect(runs().map((run) => [run.thinking, run.output])).toEqual([
      ["甲思考1。甲思考2。甲思考3。", undefined],
      [undefined, undefined]
    ]);

    frames.shift()?.(16);
    const [childA, childB] = runs();
    expect(childA).toMatchObject({
      thinking: "甲思考1。甲思考2。甲思考3。",
      output: "甲交接。"
    });
    expect(childA?.processingSteps.map((step) => step.type)).toEqual([
      "thinking",
      "response"
    ]);
    expect(childB?.thinking).toBe("乙思考1。乙思考2。乙思考3。");

    // A tool call settles the child's earlier text before it is added.
    text("child_b", "thinking_delta", "乙再想一步。");
    send("subagent.activity", {
      ...child("child_b"),
      activity: {
        type: "tool_requested",
        toolCallId: "child_b:read_1",
        toolName: "read",
        args: { id: "chapter_2" }
      }
    });
    expect(
      runs()[1]?.processingSteps.map((step) => [
        step.type,
        step.type === "tool" ? step.toolCallId : step.content
      ])
    ).toEqual([
      ["thinking", "乙思考1。乙思考2。乙思考3。乙再想一步。"],
      ["tool", "child_b:read_1"]
    ]);
    controller.dispose();
  });
});
