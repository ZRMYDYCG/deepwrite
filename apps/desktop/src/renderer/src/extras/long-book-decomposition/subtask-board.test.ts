import { beforeEach, expect, it, vi } from "vitest";
import {
  createSubagentRunTracker,
  type SubagentTrackerEvent
} from "../agent-runtime/subagentRunTracker";
import {
  buildSubtaskRows,
  subtaskAction,
  subtaskCounts,
  subtaskParentState
} from "./subtask-board";

const runtime = { provider: "test", model: "m", mode: "provider" } as const;
let tick = 0;
beforeEach(() => {
  tick = 0;
  vi.stubGlobal("requestAnimationFrame", undefined);
});
function event(type: string, payload: Record<string, unknown>) {
  tick++;
  return {
    id: `event_${tick}`,
    timestamp: new Date(1_700_000_000_000 + tick * 1_000).toISOString(),
    type,
    payload: {
      sessionId: "s",
      runId: "r",
      parentToolCallId: "call",
      ...payload
    }
  } as unknown as SubagentTrackerEvent;
}
type Task = { key: string; task: string; dependsOn?: string[] };
const child = (
  id: string,
  index: number,
  key: string,
  dependsOn: string[]
) => ({
  subagentRunId: id,
  subagentId: "character_archivist",
  name: "人物档案师",
  runtime,
  batchTask: { index, key, dependsOn }
});
function setup(tasks: Task[], unitIds: string[]) {
  const tracker = createSubagentRunTracker();
  tracker.begin({ phase: "integrate", unitIds });
  tracker.handleEvent(
    event("subagent.planned", {
      tasks: tasks.map(({ key, task, dependsOn }, index) => ({
        index,
        key,
        dependsOn: dependsOn ?? [],
        subagentId: "character_archivist",
        name: "人物档案师",
        task,
        runtime
      }))
    })
  );
  const start = (index: number) => {
    const { key, task, dependsOn } = tasks[index]!;
    tracker.handleEvent(
      event("subagent.started", {
        ...child(`sub_${key}`, index, key, dependsOn ?? []),
        task
      })
    );
  };
  const complete = (index: number, status = "completed") => {
    const { key, dependsOn } = tasks[index]!;
    tracker.handleEvent(
      event("subagent.completed", {
        ...child(`sub_${key}`, index, key, dependsOn ?? []),
        status,
        summary: "交接"
      })
    );
  };
  return { tracker, start, complete, pkg: () => tracker.packages.value[0]! };
}
const tasks: Task[] = [
  { key: "a", task: "character:a" },
  { key: "b", task: "character:b" },
  { key: "c", task: "character:c", dependsOn: ["a"] },
  { key: "d", task: "character:d" }
];
const units = [
  "character:a",
  "character:b",
  "character:c",
  "character:d",
  "world:x"
];

it("运行中、排队、待分派、已结束分组，并给出排队原因", () => {
  const f = setup(tasks, units);
  f.start(0);
  f.start(1);
  f.complete(1);
  const rows = buildSubtaskRows(f.pkg());
  expect(rows.map(({ key, group }) => [group, key])).toEqual([
    ["running", "call:0"],
    ["queued", "call:2"],
    ["queued", "call:3"],
    ["unassigned", "unit:world:x"],
    ["finished", "call:1"]
  ]);
  const [, waiting, slot] = rows;
  expect(waiting).toMatchObject({
    waitingFor: ["a"],
    unitIds: ["character:c"]
  });
  expect(waiting!.slotPosition).toBeUndefined();
  expect(slot).toMatchObject({ waitingFor: [], slotPosition: 1 });
  expect(subtaskCounts(rows)).toEqual({
    all: 5,
    running: 1,
    queued: 2,
    unassigned: 1,
    finished: 1
  });
});

it("依赖结束后不再等它；失败的依赖同样不再阻塞", () => {
  const f = setup(tasks, units);
  f.start(0);
  f.complete(0, "error");
  const waiting = buildSubtaskRows(f.pkg()).find(
    ({ run }) => run?.batchTask?.key === "c"
  );
  // b has not started either, so it is ahead of c in line.
  expect(waiting).toMatchObject({ waitingFor: [], slotPosition: 2 });
});

it("工作包结束后不再显示待分派；已结束按完成时间倒序，未启动的收尾为已停止", () => {
  const f = setup(tasks, units);
  f.start(0);
  f.start(1);
  f.complete(1);
  f.complete(0);
  f.tracker.end("stopped");
  const rows = buildSubtaskRows(f.pkg());
  expect(rows.some(({ group }) => group === "unassigned")).toBe(false);
  expect(rows.every(({ group }) => group === "finished")).toBe(true);
  const keys = rows.map(({ run }) => run!.batchTask!.key);
  expect(keys.indexOf("a")).toBeLessThan(keys.indexOf("b"));
  expect(rows.find(({ run }) => run?.batchTask?.key === "c")!.run!.status).toBe(
    "stopped"
  );
});

it("当前动作取自子任务最后一步", () => {
  const f = setup(tasks, units);
  f.start(0);
  const run = () => f.pkg().message.subagentRuns![0]!;
  expect(subtaskAction(run())).toEqual({ kind: "starting" });
  f.tracker.handleEvent(
    event("subagent.activity", {
      ...child("sub_a", 0, "a", []),
      activity: {
        type: "tool_requested",
        toolCallId: "t1",
        toolName: "write_character_dossier",
        args: {}
      }
    })
  );
  expect(subtaskAction(run())).toEqual({
    kind: "tool",
    toolName: "write_character_dossier"
  });
  f.tracker.handleEvent(
    event("subagent.activity", {
      ...child("sub_a", 0, "a", []),
      activity: {
        type: "tool_completed",
        toolCallId: "t1",
        toolName: "write_character_dossier",
        resultSummary: "已保存",
        isError: false
      }
    })
  );
  expect(subtaskAction(run())).toEqual({ kind: "thinking" });
});

it("主控状态：等名额优先，其次已结束，再按正在调用的工具", () => {
  const f = setup(tasks, units);
  const idle = { kind: "thinking" } as const;
  expect(subtaskParentState(idle, false, f.pkg())).toBe("thinking");
  expect(
    subtaskParentState(
      { kind: "tool", toolName: "spawn_subagent" },
      false,
      f.pkg()
    )
  ).toBe("dispatching");
  expect(
    subtaskParentState({ kind: "tool", toolName: "read_cards" }, false, f.pkg())
  ).toBe("querying");
  expect(subtaskParentState(idle, true, f.pkg())).toBe("waitingForSlot");
  f.tracker.end("completed");
  expect(subtaskParentState(idle, false, f.pkg())).toBe("ended");
});
