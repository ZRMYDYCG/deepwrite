import { describe, expect, it } from "vitest";
import {
  ShortBookAnalysisPresetSchema,
  type ExtrasAgentResolvedTaskOf
} from "@deepwrite/contracts";
import { resolveTaskAgent, runFauxExtras } from "../extras.test-support";

const profile = ShortBookAnalysisPresetSchema.parse({
  id: "preset",
  name: "短篇剧情",
  description: "测试",
  systemPrompt: "分析全文",
  selectionMode: "multiple",
  output: { domain: "material", kind: "plot", stageId: "pacing" }
});
const task: ExtrasAgentResolvedTaskOf<"short-book-analysis"> = {
  agentId: "short-book-analysis",
  profile,
  input: {
    jobId: "short-job",
    books: [
      {
        id: "a",
        title: "来信",
        text: "第一章 来信\n整篇正文".repeat(2000),
        kind: "paste",
        importedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "b",
        title: "归来",
        text: "第二篇完整正文",
        kind: "paste",
        importedAt: "2026-01-01T00:00:00.000Z"
      }
    ]
  }
};

describe("short analysis agent", () => {
  it("injects every complete body and provides only the result tool", () => {
    const { userMessage, systemPrompt, tools } = resolveTaskAgent(task);
    const books = JSON.parse(
      userMessage.slice(userMessage.indexOf("["))
    ) as Array<{
      text: string;
    }>;
    expect(books.map((b) => b.text)).toEqual(
      task.input.books.map((b) => b.text)
    );
    expect(systemPrompt.startsWith("分析全文")).toBe(true);
    expect(systemPrompt).toContain("【短篇拆书运行边界】");
    expect(tools().map((t) => t.name)).toEqual(["write_analysis_result"]);
  });
  it("requires a valid result and disallows a second result", async () => {
    const tool = resolveTaskAgent(task).tools()[0]!;
    expect(tool.parameters).toMatchObject({
      required: ["name", "description", "content"]
    });
    await expect(
      tool.execute("missing-description", { name: "名称", content: "正文" })
    ).rejects.toThrow();
    await expect(
      tool.execute("call", {
        name: "",
        description: "用于提炼写作方法。",
        content: ""
      })
    ).rejects.toThrow();
    const result = await tool.execute("call", {
      name: "综合分析",
      description: "用于提炼写作方法。",
      content: "完整结果"
    });
    expect(result.details).toMatchObject({
      kind: "extras-agent-output",
      agentId: "short-book-analysis",
      jobId: task.input.jobId,
      output: {
        kind: "book-analysis-result",
        result: {
          name: "综合分析",
          description: "用于提炼写作方法。",
          content: "完整结果"
        }
      }
    });
    await expect(
      tool.execute("again", {
        name: "重复",
        description: "用于提炼写作方法。",
        content: "结果"
      })
    ).rejects.toThrow("一份");
  });
  it("completes the faux lifecycle with a single isolated short result", async () => {
    const events = await runFauxExtras({
      ...task,
      input: {
        ...task.input,
        books: task.input.books.map((b) => ({
          ...b,
          text: b.text.slice(0, 100)
        }))
      }
    });
    expect(
      events.filter((e) => e.type === "extras_agent.output_updated")
    ).toMatchObject([
      { payload: { output: { kind: "book-analysis-result" } } }
    ]);
    expect(events.some((e) => e.type === "agent.completed")).toBe(true);
  });
});
