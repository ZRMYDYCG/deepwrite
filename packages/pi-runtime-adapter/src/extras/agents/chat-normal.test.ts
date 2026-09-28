import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_ASSISTANT_NORMAL_PROMPT } from "@deepwrite/contracts";
import { PiAgentRuntimeAdapter } from "../../adapter";
import { planExtrasRun } from "../run-plan";
import {
  resolveConversationAgent,
  runFauxExtras
} from "../extras.test-support";
import { cachedAgents, chatNormalTask } from "./chat.test-support";

function resultText(result: {
  content: Array<{ type: string; text?: string }>;
}) {
  const first = result.content[0];
  return first?.type === "text" ? first.text : "";
}

describe("normal chat agent", () => {
  it("puts the persona profile above the non-editable boundary and app facts", () => {
    const { systemPrompt, webSearchEnabled } =
      resolveConversationAgent(chatNormalTask());
    expect(systemPrompt.startsWith(DEFAULT_CHAT_ASSISTANT_NORMAL_PROMPT)).toBe(
      true
    );
    const boundary = systemPrompt.indexOf("【普通聊天运行边界】");
    expect(boundary).toBeGreaterThan(0);
    expect(systemPrompt.indexOf("DeepWrite 软件基础情况")).toBeGreaterThan(
      boundary
    );
    expect(systemPrompt).toContain("Shell、网络、浏览器");
    expect(systemPrompt).not.toContain("本轮已启用 DeepSeek 服务端智能搜索");
    expect(webSearchEnabled).toBe(false);
  });

  it("describes DeepSeek server-side search only when the task enables it", () => {
    const task = chatNormalTask(true);
    const { systemPrompt, webSearchEnabled } = resolveConversationAgent(task);
    expect(webSearchEnabled).toBe(true);
    expect(systemPrompt).toContain("本轮已启用 DeepSeek 服务端智能搜索");
    expect(systemPrompt).toContain(
      "网络能力仅限本轮列出的 DeepSeek 服务端 web_search"
    );
    expect(systemPrompt).not.toContain("Shell、网络、浏览器");
    const plan = planExtrasRun({
      runId: "run",
      spec: { sessionId: "session", task, conversation: { message: "热点" } }
    });
    expect(plan.target.webSearchEnabled).toBe(true);
  });

  it("exposes summaries and redacted model and usage queries only", async () => {
    const tools = resolveConversationAgent(chatNormalTask()).tools();
    const names = tools.map(({ name }) => name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_creation_projects",
        "get_material_library_summary",
        "get_skill_library_summary",
        "query_model_configs",
        "query_model_usage"
      ])
    );
    expect(
      names.some((name) => /write|edit|delete|propos|approv/u.test(name))
    ).toBe(false);
    expect(names).not.toContain("read_workspace_content");
    const modelTool = tools.find(({ name }) => name === "query_model_configs")!;
    const output = resultText(await modelTool.execute("model", {}));
    expect(output).toContain("credentialConfigured");
    expect(output).not.toMatch(/apiKey|baseUrl|requestModelId|\/Users\//u);
  });

  it("keeps a raw multi-turn conversation under its own cache key", async () => {
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    const sessionId = "session-normal-chat";
    const events = await runFauxExtras(chatNormalTask(), runtime, {
      sessionId,
      runId: "run-1",
      conversation: { message: "你好，只聊聊天" }
    });
    await runFauxExtras(chatNormalTask(), runtime, {
      sessionId,
      runId: "run-2",
      conversation: { message: "继续刚才的话题" }
    });

    const completed = events.find((event) => event.type === "agent.completed");
    expect(completed?.payload).toMatchObject({
      content: expect.stringContaining("我收到了你的消息：你好，只聊聊天")
    });
    expect(
      events.some((event) => event.type === "extras_agent.output_updated")
    ).toBe(false);
    const agent = cachedAgents(runtime).get(
      `${sessionId}:extras:chat-normal:normal`
    )!;
    expect(
      agent.state.messages
        .filter((message) => message.role === "user")
        .map((message) => message.content)
    ).toEqual(["你好，只聊聊天", "继续刚才的话题"]);
  });
});
