import type { AgentTool, StreamFn } from "@earendil-works/pi-agent-core";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  type Api,
  type Context,
  type Model
} from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { buildSpawnSubagentTool } from "./subagent-runtime";

type Responses = Parameters<ReturnType<typeof fauxProvider>["setResponses"]>[0];

async function runChild(responses: Responses) {
  const faux = fauxProvider({
    api: `reply-guard-${Math.random()}`,
    provider: `reply-guard-${Math.random()}`,
    tokensPerSecond: 0,
    models: [{ id: "child-model", name: "Child", reasoning: true }]
  });
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const requests: string[] = [];
  const streamFn: StreamFn = (model, context: Context, options) => {
    requests.push(JSON.stringify(context.messages));
    return models.streamSimple(model, context, options);
  };
  let saved = 0;
  const submit: AgentTool = {
    name: "submit_items",
    label: "提交",
    description: "测试提交工具。",
    parameters: Type.Object({ items: Type.Array(Type.String()) }),
    execute: async () => {
      saved += 1;
      return { content: [{ type: "text", text: "已保存" }], details: {} };
    }
  };
  const spawn = buildSpawnSubagentTool({
    parentSessionId: "parent-session",
    model: faux.getModel("child-model") as Model<Api>,
    thinkingLevel: "high",
    streamFn,
    definitions: [
      {
        id: "registrar",
        name: "名册员",
        description: "整理名册。",
        systemPrompt: "整理名册。",
        enabled: true,
        modelMode: "inherit"
      }
    ],
    buildChildTools: () => [submit]
  });
  if (!spawn) throw new Error("spawn_subagent was not built");
  const result = await spawn.execute("parent-call", {
    subagent_id: "registrar",
    task: "提交名册"
  } as never);
  const text = result.content.find((item) => item.type === "text");
  return {
    text: text?.type === "text" ? text.text : "",
    requests,
    saved: () => saved
  };
}

const cut = (content: Parameters<typeof fauxAssistantMessage>[0]) =>
  fauxAssistantMessage(content, { stopReason: "length" });

describe("subagent replies that end without a result", () => {
  it("asks for smaller batches after a reply cut off while reasoning", async () => {
    const child = await runChild([
      cut(fauxThinking("逐条推敲一千个名字……")),
      fauxAssistantMessage(fauxToolCall("submit_items", { items: ["c1"] }), {
        stopReason: "toolUse"
      }),
      fauxAssistantMessage(fauxText("名册已分批提交。"))
    ]);
    expect(child.text).toBe("名册已分批提交。");
    expect(child.saved()).toBe(1);
    expect(child.requests[1]).toContain("超过了模型单次输出上限");
  });

  it("never runs a tool call cut off at the limit and asks again", async () => {
    const child = await runChild([
      cut(fauxToolCall("submit_items", { items: ["c1"] })),
      fauxAssistantMessage(fauxToolCall("submit_items", { items: ["c1"] }), {
        stopReason: "toolUse"
      }),
      fauxAssistantMessage(fauxText("已提交。"))
    ]);
    expect(child.text).toBe("已提交。");
    expect(child.saved()).toBe(1);
    expect(child.requests[1]).toContain("把提交拆成更小的批次");
  });

  it("fails with the cut-off reason once the continuations are spent", async () => {
    const child = await runChild([
      cut(fauxThinking("第一次")),
      cut(fauxThinking("第二次")),
      cut(fauxThinking("第三次"))
    ]);
    expect(child.text).toContain("连续 3 次超过模型单次输出上限被截断");
    expect(child.text).not.toContain("没有生成可交接的摘要");
  });

  it("nudges an empty reply once before giving up on a handoff", async () => {
    const child = await runChild([
      fauxAssistantMessage(fauxThinking("想完了但没写。")),
      fauxAssistantMessage(fauxText("没有需要提交的名字。"))
    ]);
    expect(child.text).toBe("没有需要提交的名字。");
    expect(child.requests[1]).toContain("上一条回复是空的");
  });
});
