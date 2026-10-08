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
import { parseStoredMessage } from "./agent-conversation/parse-message";

describe("conversation compaction presentation", () => {
  it("retains an embedded summary between tool steps through completion and history reload", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api });
    controller.draft.value = "继续写";
    const sessionId = controller.sessionId.value;
    const runId = "run-embedded-compaction";
    const messageId = "message-embedded-compaction";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    function emitTool(toolCallId: string): void {
      controller.handleEvent(
        createEnvelope(
          "tool.call_requested",
          {
            sessionId,
            runId,
            runtime,
            toolCallId,
            toolName: "read_file",
            args: { path: `${toolCallId}.md` }
          },
          eventOptions(sessionId, runId, `${toolCallId}-requested`)
        )
      );
      controller.handleEvent(
        createEnvelope(
          "tool.execution_completed",
          {
            sessionId,
            runId,
            runtime,
            toolCallId,
            toolName: "read_file",
            resultSummary: "已读取",
            isError: false
          },
          eventOptions(sessionId, runId, `${toolCallId}-completed`)
        )
      );
    }

    emitTool("before-summary");
    controller.handleEvent(
      createEnvelope(
        "agent.thinking_delta",
        { sessionId, runId, messageId, runtime, delta: "核对已读取内容" },
        eventOptions(sessionId, runId, "thinking-before-summary")
      )
    );
    for (const phase of ["started", "completed"] as const) {
      controller.handleEvent(
        createEnvelope(
          "agent.context_compaction",
          {
            sessionId,
            runId,
            messageId,
            runtime,
            phase,
            reason: "run_limit" as const,
            level: "summary" as const,
            ...(phase === "completed"
              ? {
                  tokensBefore: 100,
                  tokensAfter: 60,
                  checkpoint: {
                    summary: "中途摘要",
                    createdAt: new Date().toISOString(),
                    tokensBefore: 100
                  }
                }
              : {})
          },
          eventOptions(sessionId, runId, `embedded-summary-${phase}`)
        )
      );
    }
    emitTool("after-summary");
    const message = controller.messages.value.at(-1);
    if (!message) throw new Error("Missing assistant message");
    const live = conversationTimelineBlocks(message);
    expect(live).toHaveLength(1);
    expect(live[0]?.items).toMatchObject([
      {
        type: "work-group",
        items: [
          { type: "tool-group", tools: [{ id: "before-summary" }] },
          { type: "thinking", content: "核对已读取内容" },
          {
            type: "compaction",
            compaction: { checkpoint: { summary: "中途摘要" } }
          },
          { type: "tool-group", tools: [{ id: "after-summary" }] }
        ]
      }
    ]);

    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId,
          messageId,
          runtime,
          role: "assistant" as const,
          content: "最终回答"
        },
        eventOptions(sessionId, runId, "embedded-run-completed")
      )
    );
    const settled = conversationTimelineBlocks(message);
    expect(settled[0]?.items).toEqual(
      live[0]?.items.map((item) => ({
        ...item,
        ...(item.type === "work-group" ? { running: false } : {})
      }))
    );
    expect(visibleResponse(message)).toBe("最终回答");
    const restored = parseStoredMessage(JSON.parse(JSON.stringify(message)));
    if (!restored) throw new Error("Stored message did not parse");
    expect(conversationTimelineBlocks(restored)).toEqual(settled);
    controller.dispose();
  });

  it("keeps an end-of-run compaction in processing and displays the answer outside", async () => {
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
    ).toEqual(["processing"]);
    expect(
      message && conversationTimelineBlocks(message)[0]?.items
    ).toMatchObject([{ type: "compaction", compaction: { reason: "idle" } }]);
    expect(message && visibleResponse(message)).toBe("最终回答");
    controller.dispose();
  });

  it("keeps a terminal-only answer outside processing while retaining its summary inside", async () => {
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
    ).toEqual(["processing"]);
    expect(
      message && conversationTimelineBlocks(message)[0]?.items
    ).toMatchObject([
      {
        type: "compaction",
        compaction: { checkpoint: { summary: "前情摘要" } }
      }
    ]);
    expect(message && visibleResponse(message)).toBe("最终回答");
    controller.dispose();
  });
});
