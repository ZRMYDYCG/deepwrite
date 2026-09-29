import { describe, expect, it } from "vitest";
import type { AgentToolTrace, ChatMessage } from "../types/conversation";
import {
  processingDisplayItems,
  processingItems,
  processingLabel,
  visibleResponse,
  workspaceToolLabel
} from "./conversationToolPresentation";

const startedAt = "2026-01-01T00:00:00.000Z";

function tool(
  id: string,
  status: AgentToolTrace["status"] = "completed"
): AgentToolTrace {
  return {
    id,
    name: id === "search" ? "web_search" : "read_workspace_content",
    args: { query: id },
    status,
    requestedAt: startedAt,
    ...(status === "completed" ? { resultSummary: `${id} 完成` } : {})
  };
}

function orderedMessage(
  status: NonNullable<ChatMessage["status"]>
): ChatMessage {
  return {
    id: "message_ordered",
    role: "assistant",
    content: status === "completed" ? "最终回复" : "阶段回答 A阶段回答 B",
    createdAt: startedAt,
    processingStartedAt: startedAt,
    ...(status === "completed"
      ? { processingCompletedAt: "2026-01-01T00:00:06.000Z" }
      : {}),
    status,
    toolCalls: [tool("read"), tool("search")],
    processingSteps: [
      {
        id: "thinking-a",
        type: "thinking",
        content: "思考 A",
        createdAt: "2026-01-01T00:00:01.000Z"
      },
      {
        id: "response-a",
        type: "response",
        content: "阶段回答 A",
        createdAt: "2026-01-01T00:00:02.000Z"
      },
      {
        id: "tool-a",
        type: "tool",
        toolCallId: "read",
        createdAt: "2026-01-01T00:00:03.000Z"
      },
      {
        id: "thinking-b",
        type: "thinking",
        content: "思考 B",
        createdAt: "2026-01-01T00:00:04.000Z"
      },
      {
        id: "response-b",
        type: "response",
        content: "阶段回答 B",
        createdAt: "2026-01-01T00:00:05.000Z"
      },
      {
        id: "tool-b",
        type: "tool",
        toolCallId: "search",
        createdAt: "2026-01-01T00:00:05.500Z"
      },
      ...(status === "completed"
        ? [
            {
              id: "response-final",
              type: "response" as const,
              content: "最终回复",
              createdAt: "2026-01-01T00:00:06.000Z"
            }
          ]
        : [])
    ]
  };
}

describe("conversation tool presentation", () => {
  it("preserves interleaved thinking, responses and tools while streaming", () => {
    const message = orderedMessage("streaming");

    expect(processingItems(message).map((item) => item.type)).toEqual([
      "thinking",
      "response",
      "tool",
      "thinking",
      "response",
      "tool"
    ]);
    expect(processingDisplayItems(message).map((item) => item.type)).toEqual([
      "work-group",
      "response",
      "work-group",
      "response",
      "work-group"
    ]);
    const groups = processingDisplayItems(message).filter(
      (item) => item.type === "work-group"
    );
    expect(groups.map((item) => item.running)).toEqual([false, false, true]);
    expect(visibleResponse(message)).toBe("");
  });

  it("moves only the final completed response outside the processing history", () => {
    const message = orderedMessage("completed");

    expect(
      processingItems(message)
        .filter((item) => item.type === "response")
        .map((item) => item.content)
    ).toEqual(["阶段回答 A", "阶段回答 B"]);
    expect(visibleResponse(message)).toBe("最终回复");
    expect(processingLabel(message, Date.parse(startedAt))).toBe("已处理 6秒");
    expect(
      processingLabel(
        orderedMessage("streaming"),
        Date.parse(startedAt) + 3_000
      )
    ).toBe("已处理 3秒");
    expect(
      processingDisplayItems(message)
        .filter((item) => item.type === "work-group")
        .every((item) => item.type === "work-group" && !item.running)
    ).toBe(true);
  });

  it("advances processed time from seconds to minutes and seconds", () => {
    const message = orderedMessage("completed");
    for (const [durationSeconds, label] of [
      [59, "已处理 59秒"],
      [60, "已处理 1分0秒"],
      [61, "已处理 1分1秒"],
      [125, "已处理 2分5秒"]
    ] as const) {
      message.processingCompletedAt = new Date(
        Date.parse(startedAt) + durationSeconds * 1_000
      ).toISOString();
      expect(processingLabel(message, Date.parse(startedAt))).toBe(label);
    }
  });

  it("supports legacy thinking and tool fields", () => {
    const message: ChatMessage = {
      id: "message_legacy",
      role: "assistant",
      content: "旧回复",
      createdAt: startedAt,
      thinking: "旧思考",
      toolCalls: [tool("read")],
      status: "completed"
    };

    expect(processingItems(message).map((item) => item.type)).toEqual([
      "thinking",
      "tool"
    ]);
    expect(processingDisplayItems(message).map((item) => item.type)).toEqual([
      "work-group"
    ]);
    expect(visibleResponse(message)).toBe("旧回复");
  });

  it("provides Chinese labels for chat-assistant tools", () => {
    expect(workspaceToolLabel("list_creation_projects")).toBe("列出创作项目");
    expect(workspaceToolLabel("query_model_usage")).toBe("查询模型用量");
    expect(workspaceToolLabel("list")).toBe("列出范围细节");
    expect(workspaceToolLabel("search_continuity_files")).toBe(
      "搜索连续性文件"
    );
    expect(workspaceToolLabel("web_search")).toBe("智能搜索");
  });
});
