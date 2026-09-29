import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../types/conversation";
import {
  applyContextCompactionEvent,
  parseStoredContextCompactions
} from "../composables/agent-conversation/context-compaction";
import { parseStoredMessage } from "../composables/agent-conversation/parse-message";
import { visibleResponse } from "./conversationToolPresentation";
import { conversationTimelineBlocks } from "./conversationTimelineBlocks";

const at = (seconds: number): string =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
const runtime = {
  mode: "local-faux" as const,
  provider: "example",
  model: "test"
};

function message(status: "streaming" | "completed"): ChatMessage {
  return {
    id: "assistant-one",
    role: "assistant",
    content: "最终回答",
    createdAt: at(0),
    processingStartedAt: at(0),
    status,
    processingSteps: [
      {
        id: "thinking-a",
        type: "thinking",
        content: "先读取",
        createdAt: at(1)
      }
    ]
  };
}

function compaction(
  item: ChatMessage,
  id: string,
  seconds: number,
  phase: "started" | "completed",
  level: "prune" | "summary"
): void {
  applyContextCompactionEvent(
    item,
    {
      runId: "run-one",
      sessionId: "session-one",
      messageId: item.id,
      runtime,
      phase,
      reason: level === "prune" ? "threshold" : "run_limit",
      level,
      ...(phase === "completed" ? { tokensBefore: 100, tokensAfter: 60 } : {}),
      ...(phase === "completed" && level === "summary"
        ? {
            checkpoint: {
              summary: "已归纳早期讨论",
              createdAt: at(seconds),
              tokensBefore: 100
            }
          }
        : {})
    },
    id,
    at(seconds)
  );
}

describe("conversation compaction placement", () => {
  it("closes processing at each compaction and preserves a preceding final response", () => {
    const item = message("completed");
    compaction(item, "prune", 2, "completed", "prune");
    item.processingSteps!.push({
      id: "thinking-b",
      type: "thinking",
      content: "继续写",
      createdAt: at(3)
    });
    item.processingSteps!.push({
      id: "response",
      type: "response",
      content: "最终回答",
      createdAt: at(4)
    });
    compaction(item, "summary-start", 5, "started", "summary");
    compaction(item, "summary-end", 6, "completed", "summary");

    const blocks = conversationTimelineBlocks(item);
    expect(blocks.map((block) => block.kind)).toEqual([
      "processing",
      "compaction",
      "processing",
      "response",
      "compaction"
    ]);
    expect(blocks.filter((block) => block.kind === "compaction")).toHaveLength(
      2
    );
    expect(blocks[0]).toMatchObject({ endedAt: at(2) });
    expect(blocks[2]).toMatchObject({ endedAt: at(4) });
    expect(blocks[4]).toMatchObject({
      item: { compaction: { status: "completed", level: "summary" } }
    });
    expect(visibleResponse(item)).toBe("");
  });

  it("shows a running summary in place, then starts a new processing section", () => {
    const item = message("streaming");
    compaction(item, "summary-start", 2, "started", "summary");
    expect(conversationTimelineBlocks(item).map((block) => block.kind)).toEqual(
      ["processing", "compaction"]
    );
    compaction(item, "summary-end", 3, "completed", "summary");
    item.processingSteps!.push({
      id: "thinking-b",
      type: "thinking",
      content: "继续处理",
      createdAt: at(4)
    });
    const blocks = conversationTimelineBlocks(item);
    expect(blocks.map((block) => block.kind)).toEqual([
      "processing",
      "compaction",
      "processing"
    ]);
    expect(blocks[2]).toMatchObject({ live: true, startedAt: at(3) });
    expect(
      item.processingSteps?.filter((step) => step.type === "compaction")
    ).toHaveLength(1);
  });

  it("keeps ordinary conversations in one processed section", () => {
    const item = message("streaming");
    item.processingSteps!.push({
      id: "response",
      type: "response",
      content: "正在回答",
      createdAt: at(2)
    });
    const blocks = conversationTimelineBlocks(item);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "processing", live: true });
    if (blocks[0]?.kind === "processing") {
      expect(blocks[0].items.map((step) => step.type)).toEqual([
        "work-group",
        "response"
      ]);
    }
  });

  it("keeps a live processing section while retrying without timeline items", () => {
    const item = message("streaming");
    item.processingSteps = [];
    item.retry = {
      turnId: "retry-turn",
      attempt: 2,
      maxAttempts: 3,
      state: "scheduled"
    };
    expect(conversationTimelineBlocks(item)).toMatchObject([
      { kind: "processing", live: true, items: [] }
    ]);
  });

  it("restores compaction markers and places older events by their timestamp", () => {
    const item = message("completed");
    compaction(item, "prune", 2, "completed", "prune");
    item.contextCompactions = parseStoredContextCompactions(
      JSON.parse(JSON.stringify(item.contextCompactions))
    );
    const restored = parseStoredMessage(JSON.parse(JSON.stringify(item)));
    expect(restored?.processingSteps?.at(-1)).toMatchObject({
      type: "compaction",
      compactionId: "prune"
    });
    if (!restored) throw new Error("Stored message did not parse");
    expect(
      conversationTimelineBlocks(restored).map((block) => block.kind)
    ).toEqual(["processing", "compaction"]);

    restored.processingSteps = (restored.processingSteps ?? []).filter(
      (step) => step.type !== "compaction"
    );
    expect(
      conversationTimelineBlocks(restored).map((block) => block.kind)
    ).toEqual(["processing", "compaction"]);
  });

  it("keeps old idle compactions after the response they followed", () => {
    const item = message("completed");
    item.processingSteps!.push({
      id: "terminal-response",
      type: "response",
      content: "最终回答",
      createdAt: at(5)
    });
    item.contextCompactions = [
      {
        id: "old-idle",
        status: "completed",
        reason: "idle",
        level: "prune",
        createdAt: at(4),
        tokensBefore: 100,
        tokensAfter: 60
      }
    ];
    expect(conversationTimelineBlocks(item).map((block) => block.kind)).toEqual(
      ["processing", "response", "compaction"]
    );
    expect(visibleResponse(item)).toBe("");

    item.processingSteps = [];
    expect(conversationTimelineBlocks(item).map((block) => block.kind)).toEqual(
      ["processing", "response", "compaction"]
    );
    expect(visibleResponse(item)).toBe("");
  });
});
