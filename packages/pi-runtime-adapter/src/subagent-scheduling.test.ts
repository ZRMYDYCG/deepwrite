import { SUBAGENT_TASK_BATCH_MAX_COUNT } from "@deepwrite/contracts";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import type {
  RuntimeSubagentDefinition,
  SubagentTaskOutcome,
  SubagentTaskRequest
} from "./subagent-types";
import { runSubagentTasks } from "./subagent-scheduler";
import { planSubagentTasks } from "./subagent-task-plan";
import {
  applySubagentWriteScope,
  createSubagentWriteLock,
  parseSubagentWriteScope
} from "./subagent-write-scope";

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
const libraryManager: RuntimeSubagentDefinition = {
  ...writer,
  id: "material_manager",
  name: "素材管理",
  description: "管理素材库。",
  toolSource: "library-management"
};
const definitions = [writer, reviewer, libraryManager];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("subagent task plan", () => {
  it("numbers unnamed tasks and rejects invalid dependencies", () => {
    expect(
      planSubagentTasks(
        [
          { subagent_id: "chapter_writer", task: "写第一章" },
          { subagent_id: "reviewer", task: "审阅", depends_on: ["t1"] }
        ],
        definitions,
        false
      ).map(({ key, dependsOn, writeScope }) => ({
        key,
        dependsOn,
        writeScope
      }))
    ).toEqual([
      { key: "t1", dependsOn: [], writeScope: undefined },
      { key: "t2", dependsOn: ["t1"], writeScope: undefined }
    ]);
    const plan = (tasks: unknown) =>
      planSubagentTasks(tasks, definitions, true);
    expect(() =>
      plan([
        { key: "a", subagent_id: "chapter_writer", task: "x" },
        { key: "a", subagent_id: "reviewer", task: "y" }
      ])
    ).toThrow("任务 key 重复：a");
    expect(() =>
      plan([
        {
          key: "a",
          subagent_id: "chapter_writer",
          task: "x",
          depends_on: ["z"]
        }
      ])
    ).toThrow("依赖了不存在的任务：z");
    expect(() =>
      plan([
        {
          key: "a",
          subagent_id: "chapter_writer",
          task: "x",
          depends_on: ["b"]
        },
        { key: "b", subagent_id: "reviewer", task: "y", depends_on: ["a"] }
      ])
    ).toThrow("任务依赖形成循环");
    expect(() => plan([])).toThrow(
      `tasks 必须包含 1 到 ${SUBAGENT_TASK_BATCH_MAX_COUNT} 个子任务`
    );
    expect(() => plan([{ subagent_id: "unknown", task: "x" }])).toThrow(
      "未知或已停用的子智能体：unknown"
    );
  });

  it("orders overlapping write scopes and keeps disjoint ones parallel", () => {
    const tasks = planSubagentTasks(
      [
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
        },
        {
          key: "polish",
          subagent_id: "chapter_writer",
          task: "润色第三章",
          write_scope: ["chapter_3"]
        },
        { key: "read", subagent_id: "reviewer", task: "通读" },
        {
          key: "dir",
          subagent_id: "chapter_writer",
          task: "新增第五章",
          write_scope: ["structure", "chapter_5"]
        }
      ],
      definitions,
      true
    );
    const byKey = new Map(tasks.map((task) => [task.key, task]));
    expect(byKey.get("c4")!.dependsOn).toEqual([]);
    expect(byKey.get("polish")!.implicitDependsOn).toEqual(["c3"]);
    expect(byKey.get("read")!.dependsOn).toEqual([]);
    expect(byKey.get("read")!.writeScope).toEqual({ kind: "read-only" });
    expect(byKey.get("dir")!.writeScope).toEqual({ kind: "structure" });
    // A structure task waits for every earlier writer.
    expect(byKey.get("dir")!.implicitDependsOn).toEqual(["c3", "c4", "polish"]);
  });

  it("does not add ordering when an explicit dependency already exists", () => {
    const [, second] = planSubagentTasks(
      [
        {
          key: "a",
          subagent_id: "chapter_writer",
          task: "x",
          write_scope: ["chapter_1"]
        },
        {
          key: "b",
          subagent_id: "chapter_writer",
          task: "y",
          write_scope: ["chapter_1"],
          depends_on: ["a"]
        }
      ],
      definitions,
      true
    );
    expect(second!.implicitDependsOn).toEqual([]);
  });

  it("runs library managers alone and keeps their own target rules", () => {
    const [manager] = planSubagentTasks(
      [{ subagent_id: "material_manager", task: "整理", library_id: "lib-1" }],
      definitions,
      true
    );
    expect(manager).toMatchObject({
      libraryId: "lib-1",
      writeScope: { kind: "exclusive" }
    });
    expect(() =>
      planSubagentTasks(
        [
          {
            subagent_id: "material_manager",
            task: "整理",
            write_scope: ["chapter_1"]
          }
        ],
        definitions,
        true
      )
    ).toThrow("资料库管理成员不使用 write_scope");
    expect(() =>
      planSubagentTasks(
        [{ subagent_id: "chapter_writer", task: "写", library_id: "lib-1" }],
        definitions,
        true
      )
    ).toThrow("普通团队成员不能指定资料库管理目标");
  });
});

function request(
  key: string,
  options: Partial<SubagentTaskRequest> = {}
): SubagentTaskRequest {
  return {
    index: 0,
    key,
    definition: writer,
    task: key,
    dependsOn: [],
    implicitDependsOn: [],
    writeScope: { kind: "read-only" },
    ...options
  };
}

describe("subagent scheduler", () => {
  it("never runs more than the concurrency limit at once", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 7 }, (_, index) =>
      request(`t${index + 1}`, { index })
    );
    const outcomes = await runSubagentTasks({
      tasks,
      maxConcurrency: 5,
      runTask: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { status: "completed", summary: "ok" };
      },
      settleUnstarted: () => {
        throw new Error("no task should be left unstarted");
      }
    });
    expect(peak).toBe(5);
    expect([...outcomes.values()].every((o) => o.status === "completed")).toBe(
      true
    );
  });

  it("skips explicit dependents of a failure but not scope-ordered tasks", async () => {
    const started: string[] = [];
    const unstarted: Array<[string, SubagentTaskOutcome]> = [];
    const handoffKeys: Record<string, string[]> = {};
    const outcomes = await runSubagentTasks({
      tasks: [
        request("dependent", { dependsOn: ["broken"] }),
        request("broken"),
        request("ordered", {
          dependsOn: ["broken"],
          implicitDependsOn: ["broken"]
        }),
        request("ok"),
        request("after_ok", { dependsOn: ["ok", "dependent"] })
      ],
      maxConcurrency: 5,
      runTask: async (task, handoffs) => {
        started.push(task.key);
        handoffKeys[task.key] = handoffs.map((handoff) => handoff.key);
        return task.key === "broken"
          ? { status: "error", summary: "失败" }
          : { status: "completed", summary: `${task.key} done` };
      },
      settleUnstarted: (task, outcome) => unstarted.push([task.key, outcome])
    });
    expect(started.sort()).toEqual(["broken", "ok", "ordered"]);
    expect(handoffKeys.ordered).toEqual([]);
    expect(unstarted.map(([key, outcome]) => [key, outcome.status])).toEqual([
      ["dependent", "skipped"],
      ["after_ok", "skipped"]
    ]);
    expect(outcomes.get("after_ok")?.summary).toContain("dependent");
  });

  it("hands completed dependency summaries to the waiting task", async () => {
    const received: string[] = [];
    await runSubagentTasks({
      tasks: [request("draft"), request("review", { dependsOn: ["draft"] })],
      maxConcurrency: 5,
      runTask: async (task, handoffs) => {
        if (task.key === "review") {
          received.push(...handoffs.map((handoff) => handoff.summary));
        }
        return { status: "completed", summary: `${task.key} summary` };
      },
      settleUnstarted: () => {}
    });
    expect(received).toEqual(["draft summary"]);
  });

  it("does not start queued tasks after the parent aborts", async () => {
    const controller = new AbortController();
    const unstarted: string[] = [];
    const outcomes = await runSubagentTasks({
      tasks: [request("first"), request("second", { dependsOn: ["first"] })],
      maxConcurrency: 5,
      signal: controller.signal,
      runTask: async () => {
        controller.abort();
        return { status: "aborted", summary: "已中止" };
      },
      settleUnstarted: (task, outcome) => {
        unstarted.push(`${task.key}:${outcome.status}`);
      }
    });
    expect(unstarted).toEqual(["second:aborted"]);
    expect(outcomes.size).toBe(2);
  });
});

function writeTool(name: string, calls: string[]): AgentTool {
  return {
    name,
    label: name,
    description: name,
    parameters: Type.Object({}),
    execute: async (_id, args) => {
      calls.push(`${name}:${JSON.stringify(args)}`);
      return { content: [{ type: "text", text: "ok" }], details: {} };
    }
  };
}

describe("subagent write scope", () => {
  it("removes write tools from read-only tasks", () => {
    const calls: string[] = [];
    const tools = ["read", "edit", "create", "delete", "list"].map((name) =>
      writeTool(name, calls)
    );
    expect(
      applySubagentWriteScope(
        tools,
        parseSubagentWriteScope([]),
        createSubagentWriteLock()
      ).map((tool) => tool.name)
    ).toEqual(["read", "list"]);
  });

  it("checks targets of scoped writes, including chapter files", async () => {
    const calls: string[] = [];
    const [edit, create, del, commit] = applySubagentWriteScope(
      ["edit", "create", "delete", "propose_continuity_commit"].map((name) =>
        writeTool(name, calls)
      ),
      parseSubagentWriteScope(["chapter_3"]),
      createSubagentWriteLock()
    );
    await edit!.execute("1", { id: "chapter_3", document: "body" });
    await edit!.execute("2", {
      id: "character_li",
      document: "current_state",
      chapter_id: "chapter_3"
    });
    await del!.execute("3", { id: "chapter_3", document: "handoff" });
    await expect(
      edit!.execute("4", { id: "chapter_4", document: "body" })
    ).rejects.toThrow("对象 chapter_4 不在本任务的写入范围");
    await expect(
      edit!.execute("5", { id: "character_li", document: "core_profile" })
    ).rejects.toThrow("不在本任务的写入范围");
    await expect(
      create!.execute("6", { kind: "chapter_card" })
    ).rejects.toThrow("没有声明 structure");
    await expect(del!.execute("7", { id: "chapter_3" })).rejects.toThrow(
      "没有声明 structure"
    );
    await expect(commit!.execute("8", {})).rejects.toThrow(
      "没有声明 structure"
    );
    expect(calls).toHaveLength(3);

    const [structureCreate] = applySubagentWriteScope(
      [writeTool("create", calls)],
      parseSubagentWriteScope(["structure"]),
      createSubagentWriteLock()
    );
    await structureCreate!.execute("9", { kind: "chapter_card" });
    expect(calls).toHaveLength(4);
  });

  it("serializes write calls of concurrent children", async () => {
    const lock = createSubagentWriteLock();
    const order: string[] = [];
    const firstGate = deferred<void>();
    const first = lock.run(undefined, async () => {
      order.push("first:start");
      await firstGate.promise;
      order.push("first:end");
    });
    const second = lock.run(undefined, async () => {
      order.push("second:start");
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(order).toEqual(["first:start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("gives up waiting for the lock when the child is aborted", async () => {
    const lock = createSubagentWriteLock();
    const gate = deferred<void>();
    const holder = lock.run(undefined, () => gate.promise);
    const controller = new AbortController();
    const waiting = lock.run(controller.signal, async () => "never");
    controller.abort();
    await expect(waiting).rejects.toThrow("子智能体运行已中止");
    const third: string[] = [];
    const next = lock.run(undefined, async () => {
      third.push("ran");
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(third).toEqual([]);
    gate.resolve();
    await Promise.all([holder, next]);
    expect(third).toEqual(["ran"]);
  });
});
