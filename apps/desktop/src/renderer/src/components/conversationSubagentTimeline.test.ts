import { describe, expect, it } from "vitest";
import type {
  AgentSubagentRun,
  AgentToolTrace,
  ChatMessage
} from "../types/conversation";
import {
  hasProcessing,
  processingDisplayItems,
  processingItems,
  visibleResponse
} from "./conversationToolPresentation";

function timestamp(second: number): string {
  return `2026-01-01T00:00:${String(second).padStart(2, "0")}.000Z`;
}

function run(id: string, second: number): AgentSubagentRun {
  return {
    parentToolCallId: id,
    subagentRunId: `pending:${id}`,
    subagentId: "reviewer",
    name: id,
    task: "检查文稿",
    status: "running",
    runtime: { provider: "openai", model: "demo", mode: "local-faux" },
    toolCalls: [],
    processingSteps: [],
    startedAt: timestamp(second)
  };
}

function tool(
  id: string,
  second: number,
  name = "spawn_subagent"
): AgentToolTrace {
  return {
    id,
    name,
    args: {},
    status: "running",
    requestedAt: timestamp(second)
  };
}

function message(): ChatMessage {
  return {
    id: "message",
    role: "assistant",
    content: "最终回复",
    createdAt: timestamp(0),
    status: "streaming",
    toolCalls: [tool("child-a", 2), tool("child-b", 4)],
    // Arrival order of child events need not match parent invocation order.
    subagentRuns: [run("child-b", 4), run("child-a", 2)],
    processingSteps: [
      {
        id: "before",
        type: "response",
        content: "开始检查",
        createdAt: timestamp(1)
      },
      {
        id: "call-a",
        type: "tool",
        toolCallId: "child-a",
        createdAt: timestamp(2)
      },
      {
        id: "between",
        type: "response",
        content: "继续检查",
        createdAt: timestamp(3)
      },
      {
        id: "call-b",
        type: "tool",
        toolCallId: "child-b",
        createdAt: timestamp(4)
      },
      {
        id: "final",
        type: "response",
        content: "最终回复",
        createdAt: timestamp(5)
      }
    ]
  };
}

const orderedIds = [
  "before",
  "subagent:child-a",
  "between",
  "subagent:child-b",
  "final"
];

describe("subagent cards in the conversation timeline", () => {
  it("keeps each card at its invocation while parent output and child state change", () => {
    const current = message();
    expect(
      processingDisplayItems(current, true).map((item) => item.id)
    ).toEqual(orderedIds);
    expect(visibleResponse(current)).toBe("");

    const child = current.subagentRuns![0]!;
    child.subagentRunId = "resolved-child-b";
    child.status = "completed";
    child.completedAt = timestamp(8);
    child.output = "检查完成";
    const response = current.processingSteps!.at(-1)!;
    if (response.type === "response") response.content += "，继续补充";

    const items = processingDisplayItems(current, true);
    expect(items.map((item) => item.id)).toEqual(orderedIds);
    expect(items[3]).toMatchObject({
      type: "subagent",
      toolCallId: "child-b",
      runs: [{ status: "completed", output: "检查完成" }]
    });
    expect(items[4]).toMatchObject({
      type: "response",
      content: "最终回复，继续补充"
    });
  });

  it.each(["completed", "stopped", "error"] as const)(
    "preserves process order after %s and leaves the final response outside",
    (status) => {
      const current = message();
      current.status = status;
      expect(processingDisplayItems(current).map((item) => item.id)).toEqual(
        orderedIds.slice(0, -1)
      );
      expect(visibleResponse(current)).toBe("最终回复");
      expect(hasProcessing(current)).toBe(true);
    }
  );

  it("replaces a pending spawn tool in place once its card is available", () => {
    const current = message();
    const children = current.subagentRuns!;
    current.subagentRuns = [];
    expect(processingDisplayItems(current).map((item) => item.type)).toEqual([
      "response",
      "work-group",
      "response",
      "work-group",
      "response"
    ]);
    current.subagentRuns = children;
    expect(processingDisplayItems(current).map((item) => item.id)).toEqual(
      orderedIds
    );
  });

  it("anchors cards by the recorded step even if a tool trace is missing or timestamps differ", () => {
    const current = message();
    current.toolCalls = [];
    current.subagentRuns![0]!.startedAt = timestamp(20);
    current.subagentRuns![1]!.startedAt = timestamp(20);
    expect(processingItems(current).map((item) => item.id)).toEqual(orderedIds);
  });

  it("inserts cards from partial histories by time without duplicating anchored cards", () => {
    const current = message();
    current.processingSteps = current.processingSteps!.filter(
      (step) => step.id !== "call-a"
    );
    current.subagentRuns![1]!.startedAt = timestamp(20);
    expect(processingItems(current).map((item) => item.id)).toEqual(orderedIds);
    current.toolCalls = [];
    current.subagentRuns![1]!.startedAt = timestamp(2);
    expect(processingItems(current).map((item) => item.id)).toEqual(orderedIds);
  });

  it("preserves legacy tool order and separates tool groups across a child card", () => {
    const current = message();
    current.processingSteps = [];
    current.toolCalls = [
      tool("read-before", 1, "read_workspace_content"),
      tool("child-a", 2),
      tool("read-after", 3, "read_workspace_content"),
      tool("child-b", 4)
    ];
    expect(processingDisplayItems(current).map((item) => item.type)).toEqual([
      "work-group",
      "subagent",
      "work-group",
      "subagent"
    ]);
  });

  it("keeps child-only histories visible and ordered", () => {
    const current = message();
    current.processingSteps = [];
    current.toolCalls = [];
    expect(processingItems(current).map((item) => item.id)).toEqual([
      "subagent:child-a",
      "subagent:child-b"
    ]);
    expect(hasProcessing(current)).toBe(true);
  });
});
