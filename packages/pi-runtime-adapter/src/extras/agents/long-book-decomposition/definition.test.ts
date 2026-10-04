import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DECOMPOSITION_PROFILE,
  DECOMPOSITION_CHILD_QUERY_LIMIT,
  DecompositionResolvedInputSchema,
  type DecompositionSubmissionData,
  type DecompositionSubmitInput,
  type ExtrasAgentResolvedTaskOf
} from "@deepwrite/contracts";
import type { ExtrasAgentRunServices } from "../../definition";
import { toolNamed } from "../../extras.test-support";
import { assertProviderToolParameterSchema } from "../../../provider-tool-schema-compat";
import { longBookDecompositionAgent } from "./definition";
import { decompositionRoleDefinitions } from "./roles";
import { decompositionSubmissionTools } from "./submissions";
import { decompositionQueryTools } from "./tools";

const receipt = (input: DecompositionSubmitInput) => ({
  id: `receipt_${input.unitId.replaceAll(":", "_")}`,
  jobId: input.jobId,
  outputVersion: input.outputVersion,
  unitId: input.unitId,
  inputRevision: input.inputRevision,
  refs: [],
  savedAt: "2026-10-03T00:00:00.000Z"
});

function fixture(save: "fail" | "ok" = "fail") {
  const unit = (dependencies: string[] = []) => ({
    phase: "read",
    status: "running",
    attempts: 0,
    inputRevision: "revision_1",
    dependencies,
    updatedAt: "2026-10-02T00:00:00.000Z"
  });
  const task: ExtrasAgentResolvedTaskOf<"long-book-decomposition"> = {
    agentId: "long-book-decomposition",
    profile: DEFAULT_DECOMPOSITION_PROFILE,
    input: DecompositionResolvedInputSchema.parse({
      jobId: "job_test",
      phase: "read",
      unitIds: ["chunk:1", "chunk:2"],
      outputVersion: 1,
      attemptId: "attempt_test",
      mode: "continuation",
      modelId: "model_test",
      thinkingLevel: "off",
      inputBudget: 16_000,
      contextWindow: 200_000,
      maxTokens: 32_000,
      units: {
        "chunk:1": unit(["reading:chapter_1", "reading:chapter_3"]),
        "chunk:2": unit(["reading:chapter_2"]),
        "reading:chapter_1": unit(),
        "reading:chapter_2": unit(),
        "reading:chapter_3": unit()
      }
    })
  };
  const submit = vi.fn(async (input: DecompositionSubmitInput) => {
    if (save === "fail" || input.unitId === "reading:chapter_3")
      throw new Error("测试保存失败。");
    return receipt(input);
  });
  const query = vi.fn(async () => ({
    content: "【阅读块 chunk:1】雨夜原文",
    nextCursor: null,
    totalCharacters: 12
  }));
  const services: ExtrasAgentRunServices = {
    runId: "run_test",
    sessionId: "session_test",
    localFaux: false,
    decompositionSubmit: submit,
    decompositionQuery: query
  };
  const prepare = longBookDecompositionAgent.orchestration!(
    task,
    services
  ).prepareChild;
  const roleDefinition = (id: string) =>
    decompositionRoleDefinitions().find((definition) => definition.id === id)!;
  const prepareRole = (role: string, description: string) =>
    prepare(roleDefinition(role), undefined, undefined, {
      index: 0,
      key: "t1",
      definition: roleDefinition(role),
      task: description,
      dependsOn: []
    });
  const prepareReader = (description: string) =>
    prepareRole("reader", description);
  return { task, submit, query, services, prepareRole, prepareReader };
}

const reading = (
  chapterId: string,
  order: number
): DecompositionSubmissionData => ({
  kind: "reading",
  card: {
    chunkId: "chunk:1",
    chapters: [
      {
        chapterId,
        order,
        title: `第${order}章`,
        summary: "雨夜发现铜铃。",
        events: [],
        characters: []
      }
    ],
    characters: [],
    world: [],
    plot: { events: [], foreshadowing: [] },
    style: { notes: [], excerpts: [] }
  }
});

function worldTask(category: string) {
  const setup = fixture();
  const { task } = setup;
  task.input.phase = "integrate";
  task.input.unitIds = [`world:${category}`];
  task.input.units = {
    [`world:${category}`]: {
      ...task.input.units["chunk:2"]!,
      phase: "integrate",
      dependencies: []
    }
  };
  return setup;
}

describe("decomposition child execution boundaries", () => {
  it("defaults a single-unit status query to its current package", async () => {
    const { task, query, services } = fixture();
    task.input.unitIds = ["chunk:1"];
    await toolNamed(
      decompositionQueryTools(task, services),
      "get_decomposition_status"
    ).execute("query", {});
    expect(query).toHaveBeenCalledWith("job_test", {
      kind: "status",
      unitId: "chunk:1"
    });
  });

  it("exposes every role's batch schema through the real provider boundary", () => {
    const { task } = fixture();
    for (const definition of decompositionRoleDefinitions())
      for (const tool of decompositionSubmissionTools(
        task,
        { runId: "run_test", sessionId: "session_test" },
        definition.id as Parameters<typeof decompositionSubmissionTools>[2]
      ))
        expect(() =>
          assertProviderToolParameterSchema(tool.name, tool.parameters)
        ).not.toThrow();
  });

  it("gives every child of a role the same prompt and tools", async () => {
    const tools = (category: string) => {
      const { task, services } = worldTask(category);
      return [
        ...decompositionQueryTools(task, services, "world_archivist"),
        ...decompositionSubmissionTools(task, services, "world_archivist")
      ].map(({ name, description, parameters }) =>
        JSON.stringify({ name, description, parameters })
      );
    };
    expect(tools("items")).toEqual(tools("geography"));
    const first = await fixture().prepareReader("通读 chunk:1");
    const second = await fixture().prepareReader("通读 chunk:2");
    expect(first.systemPrompt).toBe(second.systemPrompt);
    expect(first.systemPrompt).not.toContain("chunk:");
  });

  it("rejects invented unit identifiers when the batch executes", async () => {
    const { task, services, submit } = worldTask("items");
    const writer = toolNamed(
      decompositionSubmissionTools(task, services, "world_archivist"),
      "write_world_category"
    );
    await expect(
      writer.execute("write", {
        items: [
          {
            unitId: "world:geography",
            data: {
              kind: "asset",
              asset: {
                kind: "world",
                categoryId: "geography",
                overview: "地理。",
                items: []
              }
            }
          }
        ]
      })
    ).rejects.toThrow(
      "world:geography：未保存（提交单元不在本工作包授权范围内。）"
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("hands the child its evidence pack and a proportional context budget", async () => {
    const { prepareReader, query } = fixture();
    const child = await prepareReader("通读 chunk:1");
    expect(query).toHaveBeenCalledWith("job_test", {
      kind: "brief",
      unitIds: ["chunk:1"]
    });
    expect(child.task).toContain("雨夜原文");
    expect(child.task).toContain("【主控任务说明】\n通读 chunk:1");
    expect(child.contextPolicy).toMatchObject({
      settings: { enabled: true, budgetTokens: 160_000 },
      thresholdCompaction: false,
      inPlaceSummary: true
    });
    expect(child.tools.map(({ name }) => name)).toEqual([
      "submit_chapter_reading"
    ]);
  });

  it("saves a reader's chapters in one call and closes the block", async () => {
    const { task, prepareReader, submit } = fixture("ok");
    task.input.units["chunk:1"]!.dependencies = ["reading:chapter_1"];
    const child = await prepareReader("通读 chunk:1");
    const result = await toolNamed(
      child.tools,
      "submit_chapter_reading"
    ).execute("write", {
      items: [{ unitId: "reading:chapter_1", data: reading("chapter_1", 1) }]
    });
    expect(submit.mock.calls.map(([input]) => input.unitId)).toEqual([
      "reading:chapter_1",
      "chunk:1"
    ]);
    expect(JSON.stringify(result.content)).toContain("阅读块已完成");
  });

  it("reports failed items of a batch while keeping the saved ones", async () => {
    const { prepareReader, submit } = fixture("ok");
    const child = await prepareReader("通读 chunk:1");
    const result = await toolNamed(
      child.tools,
      "submit_chapter_reading"
    ).execute("write", {
      items: [
        { unitId: "reading:chapter_1", data: reading("chapter_1", 1) },
        { unitId: "reading:chapter_3", data: reading("chapter_3", 3) }
      ]
    });
    const text = JSON.stringify(result.content);
    expect(text).toContain("reading:chapter_1：已保存");
    expect(text).toContain("reading:chapter_3：未保存（测试保存失败。）");
    expect(text).toContain("仍未保存：reading:chapter_3");
    expect(submit.mock.calls.map(([input]) => input.unitId)).not.toContain(
      "chunk:1"
    );
  });

  it("closes a block whose chapters were already saved while preparing", async () => {
    const { task, prepareReader, submit } = fixture("ok");
    task.input.units["reading:chapter_2"]!.status = "done";
    await prepareReader("通读 chunk:2");
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        unitId: "chunk:2",
        data: { kind: "finish-card" }
      })
    );
  });

  it("caps a child's follow-up lookups", async () => {
    const { task, services, query } = worldTask("items");
    const lookup = toolNamed(
      decompositionQueryTools(task, services, "world_archivist"),
      "search_source"
    );
    for (let index = 0; index < DECOMPOSITION_CHILD_QUERY_LIMIT; index++)
      await lookup.execute("query", { query: "铜铃" });
    await expect(lookup.execute("query", { query: "铜铃" })).rejects.toThrow(
      "补充查询次数已用完"
    );
    expect(query).toHaveBeenCalledTimes(DECOMPOSITION_CHILD_QUERY_LIMIT);
  });

  it("rejects unknown, incomplete and multiple reading block assignments", async () => {
    const { prepareReader } = fixture();
    for (const description of [
      "完成 chunk:3",
      "完成 chunk:10",
      "完成 chunk:1-extra"
    ])
      await expect(prepareReader(description)).rejects.toThrow("本包的单元 id");
    await expect(prepareReader("完成 chunk:1、chunk:2")).rejects.toThrow(
      "只能处理一个阅读块"
    );
  });

  it("permits one redispatch per unit without consuming other units' attempts", async () => {
    const { prepareReader } = fixture();
    await prepareReader("完成 chunk:1");
    await prepareReader("重试 chunk:1");
    await expect(prepareReader("再次重试 chunk:1")).rejects.toThrow(
      "最多分派两次"
    );
    await expect(prepareReader("完成 chunk:2")).resolves.toBeDefined();
  });

  it("keeps package data out of the coordinator's system prompt", () => {
    const { task } = fixture();
    const message = longBookDecompositionAgent.userMessage(task);
    const plan = JSON.parse(message.split("\n")[0]!.slice("工作包：".length));
    expect(plan.units["chunk:1"]).toMatchObject({
      role: "reader",
      dependencies: ["reading:chapter_1", "reading:chapter_3"]
    });
    expect(message).not.toContain("雨夜发现铜铃");
    expect(longBookDecompositionAgent.boundary(task).join("\n")).not.toContain(
      "chunk:1"
    );
  });
});
