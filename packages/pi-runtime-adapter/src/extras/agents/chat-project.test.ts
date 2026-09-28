import { describe, expect, it } from "vitest";
import { resolveConversationAgent } from "../extras.test-support";
import {
  chatProjectTask,
  longProjectRuntime,
  shortProjectRuntime
} from "./chat.test-support";

function resultText(result: {
  content: Array<{ type: string; text?: string }>;
}) {
  const first = result.content[0];
  return first?.type === "text" ? first.text : "";
}

describe("project chat agent", () => {
  it("keeps the project prompt above the boundary and leaves content to tools", () => {
    const { systemPrompt, conversationKey } =
      resolveConversationAgent(chatProjectTask());
    expect(systemPrompt.startsWith("优先核对人物动机。")).toBe(true);
    expect(systemPrompt.indexOf("【项目聊天运行边界】")).toBeGreaterThan(0);
    expect(systemPrompt).toContain("项目名称：《只读短篇》");
    expect(systemPrompt).toContain(
      "不能创建、保存、编辑、删除、审批或覆盖书籍"
    );
    expect(systemPrompt).not.toContain("雨落在旧码头");
    expect(conversationKey).toBe("chat-project:short:short-a");
  });

  it("keeps read-only boundaries while enabling server-side search", () => {
    const { systemPrompt, webSearchEnabled } = resolveConversationAgent(
      chatProjectTask(shortProjectRuntime(), true)
    );
    expect(webSearchEnabled).toBe(true);
    expect(systemPrompt).toContain("本轮已启用 DeepSeek 服务端智能搜索");
    expect(systemPrompt).toContain(
      "不能创建、保存、编辑、删除、审批或覆盖书籍"
    );
  });

  it("locks short-project tools to the selected book and pages content", async () => {
    const tools = resolveConversationAgent(chatProjectTask()).tools();
    expect(tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "list_workspace_content",
        "search_workspace_text",
        "read_workspace_content",
        "list_characters",
        "search_characters",
        "read_character",
        "read_draft_sections"
      ])
    );
    const read = tools.find(({ name }) => name === "read_workspace_content")!;
    expect(
      Object.keys((read.parameters as { properties: object }).properties)
    ).not.toContain("project_id");
    expect(
      resultText(
        await read.execute("read-ok", {
          document_id: "draft:section-1:body",
          offset: 0,
          max_characters: 4
        })
      )
    ).toContain("雨落在旧");
    expect(
      resultText(
        await read.execute("read-other", {
          document_id: "another-book-document"
        })
      )
    ).toContain("不属于当前项目");
  });

  it("retains only the long-form list and read query tools", () => {
    const tools = resolveConversationAgent(
      chatProjectTask(longProjectRuntime())
    ).tools();
    expect(
      tools
        .map(({ name }) => name)
        .filter((name) => name === "list" || name === "read")
    ).toEqual(["list", "read"]);
    expect(
      tools.some(({ name }) =>
        /create|write|edit|delete|propos|approv/u.test(name)
      )
    ).toBe(false);
    const list = tools.find(({ name }) => name === "list")!;
    expect(
      Object.keys((list.parameters as { properties: object }).properties)
    ).not.toContain("book_id");
  });
});
