import {
  createDeferredApi,
  createEnvelope,
  describe,
  document,
  eventOptions,
  expect,
  it,
  runtime,
  useAgentConversation
} from "./useAgentConversation.test-support";
import { processingItems } from "../components/conversationProcessingItems";
import { parseStoredSubagentRun } from "./agent-conversation/parse-subagent";

const batchArgs = {
  tasks: [
    { key: "c3", subagent_id: "chapter_writer", task: "写第三章" },
    { key: "c4", subagent_id: "chapter_writer", task: "写第四章" },
    {
      key: "review",
      subagent_id: "reviewer",
      task: "检查三、四章衔接",
      depends_on: ["c3", "c4"]
    }
  ]
};

async function startedController(runId: string) {
  const deferred = createDeferredApi();
  const controller = useAgentConversation({
    api: () => deferred.api,
    idleTimeoutMs: 10_000
  });
  controller.draft.value = "并行写两章";
  const sessionId = controller.sessionId.value;
  const sending = controller.sendMessage(document);
  deferred.resolveAccepted(0, {
    sessionId,
    runId,
    acceptedAt: new Date().toISOString(),
    runtime
  });
  await sending;
  controller.handleEvent(
    createEnvelope(
      "tool.call_requested",
      {
        sessionId,
        runId,
        toolCallId: "spawn_batch",
        toolName: "spawn_subagent",
        args: batchArgs,
        runtime
      },
      eventOptions(sessionId, runId, `evt_${runId}_spawn`)
    )
  );
  return { controller, sessionId };
}

function child(index: number, key: string, dependsOn: string[] = []) {
  return {
    parentToolCallId: "spawn_batch",
    subagentRunId: `subrun_${key}`,
    subagentId: index === 2 ? "reviewer" : "chapter_writer",
    name: index === 2 ? "审阅员" : "单章写手",
    runtime,
    batchTask: { index, key, dependsOn }
  };
}

describe("agent conversation controller: multi-task delegation", () => {
  it("shows one queued card per task and matches child events by task index", async () => {
    const runId = "run_batch";
    const { controller, sessionId } = await startedController(runId);
    const runs = () => controller.messages.value.at(-1)?.subagentRuns ?? [];

    expect(runs()).toMatchObject([
      { status: "queued", task: "写第三章", batchTask: { key: "c3" } },
      { status: "queued", task: "写第四章", batchTask: { key: "c4" } },
      {
        status: "queued",
        batchTask: { key: "review", dependsOn: ["c3", "c4"] }
      }
    ]);

    controller.handleEvent(
      createEnvelope(
        "subagent.started",
        { sessionId, runId, ...child(1, "c4"), task: "写第四章" },
        eventOptions(sessionId, runId, "evt_c4_started")
      )
    );
    expect(runs()[0]?.status).toBe("queued");
    expect(runs()[1]).toMatchObject({
      subagentRunId: "subrun_c4",
      status: "running"
    });
    expect(controller.isBusy.value).toBe(true);

    controller.handleEvent(
      createEnvelope(
        "subagent.completed",
        {
          sessionId,
          runId,
          ...child(1, "c4"),
          status: "error" as const,
          summary: "子智能体执行失败：模型错误",
          errorMessage: "模型错误"
        },
        eventOptions(sessionId, runId, "evt_c4_failed")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.completed",
        {
          sessionId,
          runId,
          ...child(2, "review", ["c3", "c4"]),
          status: "skipped" as const,
          summary: "前置任务 c4 没有完成，该子任务已跳过。"
        },
        eventOptions(sessionId, runId, "evt_review_skipped")
      )
    );
    expect(runs()[1]?.status).toBe("error");
    expect(runs()[2]).toMatchObject({
      subagentRunId: "subrun_review",
      status: "skipped",
      summary: "前置任务 c4 没有完成，该子任务已跳过。"
    });

    controller.handleEvent(
      createEnvelope(
        "subagent.started",
        { sessionId, runId, ...child(0, "c3"), task: "写第三章" },
        eventOptions(sessionId, runId, "evt_c3_started")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.completed",
        {
          sessionId,
          runId,
          ...child(0, "c3"),
          status: "completed" as const,
          summary: "第三章已写完。"
        },
        eventOptions(sessionId, runId, "evt_c3_completed")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "tool.execution_completed",
        {
          sessionId,
          runId,
          toolCallId: "spawn_batch",
          toolName: "spawn_subagent",
          resultSummary: "子智能体任务已全部结束：共 3 个。",
          isError: false,
          runtime
        },
        eventOptions(sessionId, runId, "evt_spawn_done")
      )
    );
    expect(runs().map((run) => run.status)).toEqual([
      "completed",
      "error",
      "skipped"
    ]);
    expect(runs()[0]?.summary).toBe("第三章已写完。");

    const groups = processingItems(controller.messages.value.at(-1)!).filter(
      (item) => item.type === "subagent"
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ toolCallId: "spawn_batch" });
    expect(groups[0]?.type === "subagent" && groups[0].runs).toHaveLength(3);
    controller.dispose();
  });

  it("names queued cards from the scheduler plan without touching started ones", async () => {
    const runId = "run_batch_planned";
    const { controller, sessionId } = await startedController(runId);
    const runs = () => controller.messages.value.at(-1)?.subagentRuns ?? [];
    expect(runs().map((run) => run.name)).toEqual([
      "chapter_writer",
      "chapter_writer",
      "reviewer"
    ]);

    controller.handleEvent(
      createEnvelope(
        "subagent.started",
        { sessionId, runId, ...child(0, "c3"), task: "写第三章" },
        eventOptions(sessionId, runId, "evt_planned_c3_started")
      )
    );
    const plannedTask = (
      index: number,
      key: string,
      name: string,
      dependsOn: string[] = []
    ) => ({
      index,
      key,
      dependsOn,
      subagentId: index === 2 ? "reviewer" : "chapter_writer",
      name,
      task: `计划中的任务 ${key}`,
      runtime
    });
    controller.handleEvent(
      createEnvelope(
        "subagent.planned",
        {
          sessionId,
          runId,
          parentToolCallId: "spawn_batch",
          tasks: [
            plannedTask(0, "c3", "单章写手"),
            plannedTask(1, "c4", "单章写手", ["c3"]),
            plannedTask(2, "review", "审阅员", ["c3", "c4"])
          ]
        },
        eventOptions(sessionId, runId, "evt_batch_planned")
      )
    );

    expect(runs()).toMatchObject([
      { status: "running", name: "单章写手", task: "写第三章" },
      {
        status: "queued",
        name: "单章写手",
        batchTask: { key: "c4", dependsOn: ["c3"] }
      },
      {
        status: "queued",
        name: "审阅员",
        subagentId: "reviewer",
        batchTask: { key: "review", dependsOn: ["c3", "c4"] }
      }
    ]);
    expect(runs()).toHaveLength(3);
    controller.dispose();
  });

  it("marks every planned card as failed when the task list is rejected", async () => {
    const runId = "run_batch_rejected";
    const { controller, sessionId } = await startedController(runId);
    controller.handleEvent(
      createEnvelope(
        "tool.execution_completed",
        {
          sessionId,
          runId,
          toolCallId: "spawn_batch",
          toolName: "spawn_subagent",
          resultSummary: "任务依赖形成循环：c3 → c4 → c3。",
          isError: true,
          runtime
        },
        eventOptions(sessionId, runId, "evt_spawn_rejected")
      )
    );
    expect(controller.messages.value.at(-1)?.subagentRuns).toMatchObject([
      { status: "error", errorMessage: "任务依赖形成循环：c3 → c4 → c3。" },
      { status: "error" },
      { status: "error" }
    ]);
    controller.dispose();
  });

  it("restores a task that never started as skipped with its identity", () => {
    const restored = parseStoredSubagentRun({
      parentToolCallId: "spawn_batch",
      subagentRunId: "pending:spawn_batch:2",
      subagentId: "reviewer",
      name: "reviewer",
      task: "检查衔接",
      status: "queued",
      runtime,
      toolCalls: [],
      processingSteps: [],
      startedAt: new Date().toISOString(),
      batchTask: { index: 2, key: "review", dependsOn: ["c3"] }
    });
    expect(restored).toMatchObject({
      status: "skipped",
      batchTask: { index: 2, key: "review", dependsOn: ["c3"] }
    });
    expect(restored?.completedAt).toBeDefined();
    expect(restored?.errorMessage).toBeTruthy();
  });
});
