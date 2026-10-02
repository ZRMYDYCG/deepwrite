import type { AgentToolResult, StreamFn } from "@earendil-works/pi-agent-core";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  validateToolArguments,
  type Api,
  type Model
} from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { SUBAGENT_TASK_BATCH_MAX_COUNT } from "@deepwrite/contracts";
import {
  buildSpawnSubagentTool,
  isSubagentToolProgressDetails,
  type RuntimeSubagentDefinition,
  type SubagentToolDetails,
  type SubagentToolProgress
} from "./subagent-runtime";

const writer: RuntimeSubagentDefinition = {
  id: "chapter_writer",
  name: "单章写手",
  description: "写一章正文。",
  systemPrompt: "只写指定章节。",
  enabled: true,
  modelMode: "inherit"
};
const reviewer: RuntimeSubagentDefinition = {
  ...writer,
  id: "reviewer",
  name: "审阅员",
  description: "审阅正文。"
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness(options: {
  responses: Parameters<ReturnType<typeof fauxProvider>["setResponses"]>[0];
  parallel: boolean;
  definitions?: RuntimeSubagentDefinition[];
  streamGate?: number;
}) {
  const faux = fauxProvider({
    api: `subagent-parallel-${Math.random()}`,
    provider: `subagent-parallel-${Math.random()}`,
    models: [{ id: "child-model", name: "Child Model", reasoning: true }],
    tokensPerSecond: 0
  });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(options.responses);
  const model = faux.getModel("child-model") as Model<Api>;
  const source = models.streamSimple.bind(models) as StreamFn;
  let arrivals = 0;
  const gate = deferred<void>();
  const streamFn: StreamFn = async (requestModel, context, streamOptions) => {
    arrivals += 1;
    if (arrivals >= (options.streamGate ?? 1)) gate.resolve();
    await gate.promise;
    return source(requestModel, context, streamOptions);
  };
  let sequence = 0;
  const tool = buildSpawnSubagentTool({
    parentSessionId: "parent-session",
    model,
    thinkingLevel: "medium",
    streamFn,
    definitions: options.definitions ?? [writer, reviewer],
    buildChildTools: () => [],
    createRunId: () => `subrun_${++sequence}`,
    parallel: options.parallel
  });
  if (!tool) throw new Error("spawn_subagent was not built");
  return tool;
}

type ChildProgress = Exclude<SubagentToolProgress, { type: "planned" }>;

function progressOf(
  updates: AgentToolResult<SubagentToolDetails>[]
): SubagentToolProgress[] {
  return updates.flatMap((update) =>
    isSubagentToolProgressDetails(update.details)
      ? [update.details.progress]
      : []
  );
}

function childProgressOf(
  updates: AgentToolResult<SubagentToolDetails>[]
): ChildProgress[] {
  return progressOf(updates).filter(
    (item): item is ChildProgress => item.type !== "planned"
  );
}

describe("spawn_subagent task lists", () => {
  it("runs independent tasks of a parallel team at the same time", async () => {
    // Both children must reach the model before either may stream.
    const tool = harness({
      parallel: true,
      streamGate: 2,
      responses: [
        fauxAssistantMessage("第三章完成"),
        fauxAssistantMessage("第四章完成")
      ]
    });
    const updates: AgentToolResult<SubagentToolDetails>[] = [];
    const result = await tool.execute(
      "parent-call",
      {
        tasks: [
          {
            key: "c3",
            subagent_id: "chapter_writer",
            task: "写第三章",
            write_scope: ["chapter_3"]
          },
          {
            key: "c4",
            subagent_id: "chapter_writer",
            task: "写第四章",
            write_scope: ["chapter_4"]
          }
        ]
      },
      undefined,
      (update) => updates.push(update)
    );
    const [planned] = progressOf(updates);
    expect(planned).toMatchObject({
      type: "planned",
      parentToolCallId: "parent-call",
      tasks: [
        { index: 0, key: "c3", name: "单章写手", dependsOn: [] },
        { index: 1, key: "c4", name: "单章写手", dependsOn: [] }
      ]
    });
    const progress = childProgressOf(updates);
    const lifecycle = progress
      .filter((item) => item.type === "started" || item.type === "completed")
      .map((item) => `${item.type}:${item.batchTask?.key}`);
    expect(lifecycle.slice(0, 2).sort()).toEqual(["started:c3", "started:c4"]);
    expect(
      progress.find((item) => item.type === "started")?.batchTask
    ).toMatchObject({ index: expect.any(Number), dependsOn: [] });
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("共 2 个，完成 2 个");
    expect(text).toContain("【c3｜单章写手｜已完成】");
    expect(text).toContain("【c4｜单章写手｜已完成】");
  });

  it("reports a skipped dependent without starting it", async () => {
    const broken: RuntimeSubagentDefinition = {
      ...writer,
      id: "broken_writer",
      name: "缺模型写手",
      modelMode: "custom",
      modelId: "missing-model"
    };
    const tool = harness({
      parallel: false,
      definitions: [broken, reviewer],
      responses: []
    });
    const updates: AgentToolResult<SubagentToolDetails>[] = [];
    const result = await tool.execute(
      "parent-call",
      {
        tasks: [
          { key: "draft", subagent_id: "broken_writer", task: "写" },
          {
            key: "review",
            subagent_id: "reviewer",
            task: "审阅",
            depends_on: ["draft"]
          }
        ]
      },
      undefined,
      (update) => updates.push(update)
    );
    expect(progressOf(updates)[0]).toMatchObject({
      type: "planned",
      tasks: [
        { key: "draft", name: "缺模型写手" },
        { key: "review", name: "审阅员", dependsOn: ["draft"] }
      ]
    });
    const review = childProgressOf(updates).filter(
      (item) => item.batchTask?.key === "review"
    );
    expect(review.map((item) => item.type)).toEqual(["completed"]);
    expect(review[0]).toMatchObject({ status: "skipped" });
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("失败 1 个");
    expect(text).toContain("跳过 1 个");
  });

  it("keeps the single-task result and accepts older flat arguments", async () => {
    const tool = harness({
      parallel: false,
      responses: [fauxAssistantMessage("只有一个交接摘要")]
    });
    expect(
      tool.prepareArguments?.({ subagent_id: "reviewer", task: "审阅" })
    ).toEqual({ tasks: [{ subagent_id: "reviewer", task: "审阅" }] });
    const updates: AgentToolResult<SubagentToolDetails>[] = [];
    const result = await tool.execute(
      "parent-call",
      { tasks: [{ subagent_id: "reviewer", task: "审阅" }] },
      undefined,
      (update) => updates.push(update)
    );
    expect(result.content[0]).toEqual({
      type: "text",
      text: "只有一个交接摘要"
    });
    expect(progressOf(updates).some((item) => item.type === "planned")).toBe(
      false
    );
    expect(childProgressOf(updates).every((item) => !item.batchTask)).toBe(
      true
    );
  });

  it("does not reject a large task list at schema validation", async () => {
    const count = SUBAGENT_TASK_BATCH_MAX_COUNT;
    const tool = harness({
      parallel: true,
      responses: Array.from({ length: count + 1 }, () =>
        fauxAssistantMessage("审阅完成")
      )
    });
    const taskList = (size: number) =>
      Array.from({ length: size }, (_, index) => ({
        key: `d${index + 1}`,
        subagent_id: "reviewer",
        task: `审阅第 ${index + 1} 章`
      }));
    const validate = (size: number) =>
      validateToolArguments(tool, {
        type: "toolCall",
        id: "parent-call",
        name: tool.name,
        arguments: { tasks: taskList(size) }
      });
    // One more than the old schema cap of 20 must pass validation and run.
    expect(() => validate(21)).not.toThrow();
    expect(() => validate(count + 1)).not.toThrow();

    const result = await tool.execute("parent-call", {
      tasks: taskList(21)
    });
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("共 21 个，完成 21 个");

    // Beyond the ceiling the call is refused with a message the model can act
    // on, rather than a schema failure.
    await expect(
      tool.execute("parent-call", { tasks: taskList(count + 1) })
    ).rejects.toThrow(`本次提交了 ${count + 1} 个，未执行任何任务`);
  });

  it("offers write_scope only to parallel teams", () => {
    const schemaOf = (parallel: boolean) =>
      JSON.stringify(harness({ parallel, responses: [] }).parameters);
    expect(schemaOf(true)).toContain("write_scope");
    expect(schemaOf(false)).not.toContain("write_scope");
  });
});
