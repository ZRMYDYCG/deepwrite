import {
  createDeferredApi,
  createEnvelope,
  describe,
  document,
  eventOptions,
  expect,
  it,
  runtime,
  useAgentConversation
} from "./useAgentConversation.test-support";
import { conversationTimelineBlocks } from "../components/conversationTimelineBlocks";
import { visibleResponse } from "../components/conversationToolPresentation";

describe("conversation compaction presentation", () => {
  it("keeps a completed answer before an end-of-run compaction", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api });
    controller.draft.value = "继续写";
    const sessionId = controller.sessionId.value;
    const runId = "run-compaction-order";
    const messageId = "message-compaction-order";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        { sessionId, runId, messageId, runtime, delta: "最终回答" },
        eventOptions(sessionId, runId, "response-before-compaction")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.context_compaction",
        {
          sessionId,
          runId,
          messageId,
          runtime,
          phase: "completed" as const,
          reason: "idle" as const,
          level: "prune" as const,
          tokensBefore: 100,
          tokensAfter: 60
        },
        eventOptions(sessionId, runId, "compaction-after-response")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId,
          messageId,
          role: "assistant" as const,
          content: "最终回答",
          runtime
        },
        eventOptions(sessionId, runId, "completed-after-compaction")
      )
    );

    const message = controller.messages.value.at(-1);
    expect(message?.processingSteps?.map((step) => step.type)).toEqual([
      "response",
      "compaction"
    ]);
    expect(
      message && conversationTimelineBlocks(message).map((block) => block.kind)
    ).toEqual(["processing", "response", "compaction"]);
    expect(message && visibleResponse(message)).toBe("");
    controller.dispose();
  });

  it("places a terminal-only answer before the idle compaction", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api });
    controller.draft.value = "继续写";
    const sessionId = controller.sessionId.value;
    const runId = "run-terminal-compaction";
    const messageId = "message-terminal-compaction";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "agent.context_compaction",
        {
          sessionId,
          runId,
          messageId,
          runtime,
          phase: "completed" as const,
          reason: "idle" as const,
          level: "summary" as const,
          tokensBefore: 100,
          tokensAfter: 60,
          checkpoint: {
            summary: "前情摘要",
            createdAt: new Date().toISOString(),
            tokensBefore: 100
          }
        },
        eventOptions(sessionId, runId, "terminal-compaction")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId,
          messageId,
          role: "assistant" as const,
          content: "最终回答",
          runtime
        },
        eventOptions(sessionId, runId, "terminal-complete")
      )
    );

    const message = controller.messages.value.at(-1);
    expect(message?.processingSteps?.map((step) => step.type)).toEqual([
      "response",
      "compaction"
    ]);
    expect(
      message && conversationTimelineBlocks(message).map((block) => block.kind)
    ).toEqual(["processing", "response", "compaction"]);
    controller.dispose();
  });
});
