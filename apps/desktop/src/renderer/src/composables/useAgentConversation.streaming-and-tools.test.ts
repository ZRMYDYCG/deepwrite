import {
  createDeferredApi,
  createEnvelope,
  describe,
  document,
  eventOptions,
  expect,
  it,
  runtime,
  useAgentConversation,
  vi
} from "./useAgentConversation.test-support";

describe("agent conversation controller: streaming-and-tools", () => {
  it("updates context after each model tool turn before the run completes", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "读取资料后续写";
    const sessionId = controller.sessionId.value;
    const runId = "run_context_progress";
    const messageId = "message_context_progress";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const observedUsage = (turn: number, totalTokens: number) =>
      createEnvelope(
        "agent.usage_observed",
        {
          sessionId,
          runId,
          messageId,
          runtime,
          observationId: `${runId}:turn:${turn}:attempt:1`,
          observedAt: new Date().toISOString(),
          turnId: `${runId}:turn:${turn}`,
          attempt: 1,
          status: "completed" as const,
          hadToolCall: true,
          usage: {
            inputTokens: totalTokens,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens
          }
        },
        eventOptions(sessionId, runId, `evt_context_${turn}`)
      );

    controller.handleEvent(observedUsage(1, 120));
    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "streaming",
      contextTokens: 120
    });

    controller.handleEvent(
      createEnvelope(
        "agent.context_compaction",
        {
          sessionId,
          runId,
          messageId,
          runtime,
          phase: "completed" as const,
          reason: "threshold" as const,
          tokensAfter: 80
        },
        eventOptions(sessionId, runId, "evt_context_compaction")
      )
    );
    expect(controller.messages.value.at(-1)?.contextTokens).toBe(80);

    controller.handleEvent(observedUsage(2, 150));
    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "streaming",
      contextTokens: 150
    });

    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId,
          messageId,
          role: "assistant" as const,
          content: "续写完成",
          runtime,
          usage: {
            inputTokens: 170,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 170
          }
        },
        eventOptions(sessionId, runId, "evt_context_completed")
      )
    );
    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "completed",
      contextTokens: 170
    });
    controller.dispose();
  });

  it("accepts events before prompt accepted and prevents duplicate sends", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "续写当前章节";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    expect(controller.messages.value.at(-1)).toMatchObject({
      role: "assistant",
      status: "streaming",
      activityOnly: true
    });
    expect(controller.messages.value.at(-1)?.processingStartedAt).toBeTruthy();
    expect(controller.messages.value.at(-1)?.runId).toBeUndefined();

    controller.draft.value = "重复发送";
    await controller.sendMessage(document);
    expect(deferred.promptCount()).toBe(1);

    controller.handleEvent(
      createEnvelope(
        "agent.thinking_delta",
        {
          sessionId,
          runId: "run_1",
          messageId: "message_1",
          delta: "读取上下文",
          runtime
        },
        eventOptions(sessionId, "run_1", "evt_1")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId,
          runId: "run_1",
          messageId: "message_1",
          delta: "流式回复",
          runtime
        },
        eventOptions(sessionId, "run_1", "evt_2")
      )
    );

    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_1",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    expect(
      controller.messages.value.filter(
        (message) => message.role === "assistant"
      )
    ).toHaveLength(1);
    expect(controller.messages.value.at(-1)).toMatchObject({
      content: "流式回复",
      thinking: "读取上下文",
      status: "streaming"
    });
    expect(controller.isBusy.value).toBe(true);
    controller.dispose();
  });

  it("batches a long thinking stream by frame without dropping any text", async () => {
    const scheduledFrames: Array<(timestamp: number) => void> = [];
    const requestFrame = vi.fn((callback: (timestamp: number) => void) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);

    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "验证超长思考流";
    const sessionId = controller.sessionId.value;
    const runId = "run_long_thinking";
    const messageId = "message_long_thinking";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const thinkingChunks = Array.from(
      { length: 1_024 },
      (_, index) =>
        `${String(index).padStart(4, "0")}:${"思考片段".repeat(24)}\n`
    );
    for (const [index, delta] of thinkingChunks.entries()) {
      controller.handleEvent(
        createEnvelope(
          "agent.thinking_delta",
          { sessionId, runId, messageId, delta, runtime },
          eventOptions(sessionId, runId, `evt_long_thinking_${index}`)
        )
      );
    }

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(controller.messages.value.at(-1)).toMatchObject({
      role: "assistant",
      status: "streaming"
    });
    expect(controller.messages.value.at(-1)?.thinking).toBeUndefined();

    scheduledFrames.shift()?.(16);
    const completeThinking = thinkingChunks.join("");
    expect(completeThinking.length).toBeGreaterThan(100_000);
    expect(controller.messages.value.at(-1)?.thinking).toBe(completeThinking);
    expect(controller.messages.value.at(-1)?.processingSteps).toMatchObject([
      { type: "thinking", content: completeThinking }
    ]);

    const responseChunks = ["最终", "回复", "也保持", "完整。"];
    for (const [index, delta] of responseChunks.entries()) {
      controller.handleEvent(
        createEnvelope(
          "agent.message_delta",
          { sessionId, runId, messageId, delta, runtime },
          eventOptions(sessionId, runId, `evt_long_response_${index}`)
        )
      );
    }
    const completeResponse = responseChunks.join("");
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId,
          messageId,
          role: "assistant" as const,
          content: completeResponse,
          thinking: completeThinking,
          runtime
        },
        eventOptions(sessionId, runId, "evt_long_thinking_completed")
      )
    );

    const message = controller.messages.value.at(-1);
    expect(message).toMatchObject({
      content: completeResponse,
      thinking: completeThinking,
      status: "completed"
    });
    expect(message?.processingSteps).toMatchObject([
      { type: "thinking", content: completeThinking },
      { type: "response", content: completeResponse }
    ]);
    expect(cancelFrame).toHaveBeenCalled();
    controller.dispose();
  });

  it("ignores accepted and events after a new conversation starts", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "旧会话问题";
    const oldSessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    controller.newConversation();

    deferred.resolveAccepted(0, {
      sessionId: oldSessionId,
      runId: "run_old",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId: oldSessionId,
          runId: "run_old",
          messageId: "message_old",
          delta: "不应出现",
          runtime
        },
        eventOptions(oldSessionId, "run_old", "evt_old")
      )
    );

    expect(controller.messages.value).toEqual([]);
    expect(controller.isBusy.value).toBe(false);
    controller.dispose();
  });

  it("cancels a prompt before its run id exists and aborts it once accepted", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "取消仍在受理中的请求";
    const oldSessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);

    expect(controller.cancelPendingGeneration()).toBe(true);
    expect(controller.sessionId.value).not.toBe(oldSessionId);
    expect(controller.isBusy.value).toBe(false);
    expect(controller.acceptsRunEvent(oldSessionId, "run_pending_cancel")).toBe(
      false
    );

    deferred.resolveAccepted(0, {
      sessionId: oldSessionId,
      runId: "run_pending_cancel",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    expect(deferred.aborts).toEqual([
      {
        sessionId: oldSessionId,
        runId: "run_pending_cancel"
      }
    ]);
    expect(controller.messages.value).toEqual([]);
    controller.dispose();
  });

  it("deduplicates events and drops late deltas after completion", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "验证事件";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_1",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const delta = createEnvelope(
      "agent.message_delta",
      {
        sessionId,
        runId: "run_1",
        messageId: "message_1",
        delta: "A",
        runtime
      },
      eventOptions(sessionId, "run_1", "evt_delta")
    );
    controller.handleEvent(delta);
    controller.handleEvent(delta);
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId: "run_1",
          messageId: "message_1",
          role: "assistant" as const,
          content: "AB",
          runtime
        },
        eventOptions(sessionId, "run_1", "evt_completed")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId,
          runId: "run_1",
          messageId: "message_1",
          delta: "迟到",
          runtime
        },
        eventOptions(sessionId, "run_1", "evt_late")
      )
    );

    expect(controller.messages.value.at(-1)?.content).toBe("AB");
    expect(controller.messages.value.at(-1)?.status).toBe("completed");
    expect(controller.isBusy.value).toBe(false);
    controller.dispose();
  });

  it("assembles isolated subagent activity across duplicate and out-of-order events", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "请让资料核对员先检查设定";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_subagent",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const base = {
      sessionId,
      runId: "run_subagent",
      parentToolCallId: "spawn_1",
      subagentRunId: "subrun_1",
      subagentId: "fact_checker",
      name: "资料核对员",
      runtime
    };
    controller.handleEvent(
      createEnvelope(
        "tool.call_requested",
        {
          sessionId,
          runId: "run_subagent",
          toolCallId: "spawn_1",
          toolName: "spawn_subagent",
          args: {
            subagent_id: "fact_checker",
            task: "核对人物年龄与章节时间线"
          },
          runtime
        },
        eventOptions(sessionId, "run_subagent", "evt_spawn_requested")
      )
    );
    expect(controller.messages.value.at(-1)?.subagentRuns).toMatchObject([
      {
        parentToolCallId: "spawn_1",
        subagentRunId: "pending:spawn_1",
        task: "核对人物年龄与章节时间线",
        status: "running"
      }
    ]);
    const thinking = createEnvelope(
      "subagent.activity",
      {
        ...base,
        activity: { type: "thinking_delta" as const, delta: "先核对时间线。" }
      },
      eventOptions(sessionId, "run_subagent", "evt_sub_thinking")
    );
    controller.handleEvent(thinking);
    controller.handleEvent(thinking);
    controller.handleEvent(
      createEnvelope(
        "subagent.completed",
        {
          ...base,
          status: "completed" as const,
          summary: "时间线一致，可以继续写作。",
          usage: {
            inputTokens: 12,
            outputTokens: 8,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 20
          }
        },
        eventOptions(sessionId, "run_subagent", "evt_sub_completed")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.started",
        { ...base, task: "核对人物年龄与章节时间线" },
        eventOptions(sessionId, "run_subagent", "evt_sub_started_late")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.activity",
        {
          ...base,
          activity: {
            type: "tool_completed" as const,
            toolCallId: "subtool_1",
            toolName: "read_workspace_content",
            resultSummary: "已读取人物与大纲",
            isError: false
          }
        },
        eventOptions(sessionId, "run_subagent", "evt_sub_tool_completed")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.activity",
        {
          ...base,
          activity: {
            type: "tool_requested" as const,
            toolCallId: "subtool_1",
            toolName: "read_workspace_content",
            args: { stage: "character_design" }
          }
        },
        eventOptions(sessionId, "run_subagent", "evt_sub_tool_requested_late")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId: "run_subagent",
          messageId: "message_subagent",
          role: "assistant" as const,
          content: "核对完成，我会按一致的时间线继续。",
          runtime
        },
        eventOptions(sessionId, "run_subagent", "evt_parent_completed")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      id: "message_subagent",
      content: "核对完成，我会按一致的时间线继续。",
      subagentRuns: [
        {
          parentToolCallId: "spawn_1",
          subagentRunId: "subrun_1",
          task: "核对人物年龄与章节时间线",
          status: "completed",
          thinking: "先核对时间线。",
          summary: "时间线一致，可以继续写作。",
          usage: { totalTokens: 20 },
          toolCalls: [
            {
              id: "subtool_1",
              status: "completed",
              args: { stage: "character_design" },
              resultSummary: "已读取人物与大纲"
            }
          ]
        }
      ]
    });
    expect(controller.messages.value.at(-1)?.content).not.toContain(
      "时间线一致"
    );
    expect(
      controller.messages.value
        .at(-1)
        ?.subagentRuns?.[0]?.processingSteps.map((step) => step.type)
    ).toEqual(["thinking", "tool"]);
    expect(controller.messages.value.at(-1)?.subagentRuns).toHaveLength(1);
    controller.markToolConflict(
      "run_subagent",
      "subtool_1",
      "文稿版本已变化，未应用子智能体变更。"
    );
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.[0]?.toolCalls[0]
    ).toMatchObject({
      status: "error",
      isError: true,
      resultSummary: "文稿版本已变化，未应用子智能体变更。"
    });
    controller.dispose();
  });

  it("settles an unfinished subagent when the parent completes", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "启动一个子任务";
    const sessionId = controller.sessionId.value;
    const runId = "run_parent_completed_with_child";
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
          toolCallId: "spawn_unfinished",
          toolName: "spawn_subagent",
          args: {
            subagent_id: "chapter_writer",
            task: "编写当前章"
          },
          runtime
        },
        eventOptions(sessionId, runId, "evt_spawn_unfinished")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId,
          messageId: "message_parent_completed_with_child",
          role: "assistant" as const,
          content: "父任务已经完成。",
          runtime
        },
        eventOptions(sessionId, runId, "evt_parent_completed_with_child")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "completed",
      subagentRuns: [
        {
          status: "error",
          errorMessage: "父智能体运行已完成，但子任务未返回完整终态。"
        }
      ]
    });
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.[0]?.completedAt
    ).toBeDefined();
    expect(controller.isBusy.value).toBe(false);

    controller.handleEvent(
      createEnvelope(
        "subagent.completed",
        {
          sessionId,
          runId,
          parentToolCallId: "spawn_unfinished",
          subagentRunId: "subrun_finished_late",
          subagentId: "chapter_writer",
          name: "单章写手",
          status: "completed" as const,
          summary: "子任务终态稍后到达。",
          runtime
        },
        eventOptions(sessionId, runId, "evt_child_completed_late")
      )
    );
    expect(controller.messages.value.at(-1)?.subagentRuns?.[0]).toMatchObject({
      subagentRunId: "subrun_finished_late",
      status: "completed",
      summary: "子任务终态稍后到达。"
    });
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.[0]?.errorMessage
    ).toBeUndefined();
    controller.dispose();
  });

  it("settles streaming presentation state before disposal", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "开始流式任务";
    const sessionId = controller.sessionId.value;
    const runId = "run_disposed_while_streaming";
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
          toolCallId: "spawn_disposed",
          toolName: "spawn_subagent",
          args: {
            subagent_id: "chapter_writer",
            task: "编写当前章"
          },
          runtime
        },
        eventOptions(sessionId, runId, "evt_spawn_disposed")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "streaming",
      subagentRuns: [{ status: "running" }]
    });
    expect(
      controller.capturePersistenceSnapshot().conversations[0]?.messages.at(-1)
    ).toMatchObject({
      status: "stopped"
    });
    expect(controller.messages.value.at(-1)?.status).toBe("streaming");
    controller.dispose();

    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "stopped",
      subagentRuns: [{ status: "stopped" }]
    });
    expect(
      controller.messages.value.at(-1)?.processingCompletedAt
    ).toBeDefined();
    expect(controller.isBusy.value).toBe(false);
  });

  it("stops an in-flight subagent card when its parent run is aborted", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "启动子任务后停止";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_subagent_abort",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "subagent.started",
        {
          sessionId,
          runId: "run_subagent_abort",
          parentToolCallId: "spawn_abort",
          subagentRunId: "subrun_abort",
          subagentId: "researcher",
          name: "资料员",
          task: "查找背景资料",
          runtime
        },
        eventOptions(sessionId, "run_subagent_abort", "evt_sub_abort_started")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.error",
        {
          sessionId,
          runId: "run_subagent_abort",
          code: "pi_agent.aborted",
          message: "Agent run aborted.",
          runtime
        },
        eventOptions(sessionId, "run_subagent_abort", "evt_sub_parent_aborted")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.started",
        {
          sessionId,
          runId: "run_subagent_abort",
          parentToolCallId: "spawn_abort_late",
          subagentRunId: "subrun_abort_late",
          subagentId: "late_researcher",
          name: "迟到的资料员",
          task: "不应恢复成执行中",
          runtime
        },
        eventOptions(
          sessionId,
          "run_subagent_abort",
          "evt_sub_abort_started_late"
        )
      )
    );

    expect(controller.messages.value.at(-1)?.status).toBe("stopped");
    expect(controller.messages.value.at(-1)?.subagentRuns?.[0]).toMatchObject({
      status: "stopped",
      errorMessage: "父智能体运行已停止，子任务同步停止。"
    });
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.[0]?.completedAt
    ).toBeTruthy();
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.map((run) => run.status)
    ).toEqual(["stopped", "stopped"]);
    controller.dispose();
  });

  it("groups thinking and tool events into the assistant processing trace", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "检查项目";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_tools",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "tool.call_requested",
        {
          sessionId,
          runId: "run_tools",
          toolCallId: "tool_1",
          toolName: "read_file",
          args: { path: "README.md" },
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_tool_start")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.thinking_delta",
        {
          sessionId,
          runId: "run_tools",
          messageId: "message_tools",
          delta: "先检查项目说明。",
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_thinking")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "tool.execution_completed",
        {
          sessionId,
          runId: "run_tools",
          toolCallId: "tool_1",
          toolName: "read_file",
          resultSummary: "已读取 README.md",
          isError: false,
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_tool_end")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId: "run_tools",
          messageId: "message_tools",
          role: "assistant" as const,
          content: "检查完成。",
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_tools_completed")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      id: "message_tools",
      content: "检查完成。",
      thinking: "先检查项目说明。",
      status: "completed",
      activityOnly: false,
      toolCalls: [
        {
          id: "tool_1",
          name: "read_file",
          status: "completed",
          resultSummary: "已读取 README.md"
        }
      ]
    });
    expect(controller.messages.value.at(-1)?.processingStartedAt).toBeTruthy();
    expect(
      controller.messages.value.at(-1)?.processingCompletedAt
    ).toBeTruthy();
    expect(
      controller.messages.value
        .at(-1)
        ?.processingSteps?.map((step) => step.type)
    ).toEqual(["tool", "thinking", "response"]);
    controller.dispose();
  });

  it("shows and incrementally updates a tool before execution starts", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "写入剧情";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_streaming_tool",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const stream = (
      phase: "start" | "delta" | "end",
      argumentsDelta: string,
      eventId: string,
      args?: unknown
    ) =>
      controller.handleEvent(
        createEnvelope(
          "tool.call_stream",
          {
            sessionId,
            runId: "run_streaming_tool",
            streamId: "message_streaming_tool:0",
            toolCallId: "tool_write_1",
            toolName: "write_workspace_editor",
            phase,
            argumentsDelta,
            runtime,
            ...(args !== undefined ? { args } : {})
          },
          eventOptions(sessionId, "run_streaming_tool", eventId)
        )
      );

    stream("start", "", "evt_tool_stream_start");
    expect(controller.messages.value.at(-1)?.toolCalls).toMatchObject([
      {
        id: "tool_write_1",
        status: "preparing",
        argumentsText: ""
      }
    ]);

    stream(
      "delta",
      '{"target_stage_id":"plot_design","text":"第一',
      "evt_tool_stream_delta_1"
    );
    stream("delta", '幕"}', "evt_tool_stream_delta_2");
    stream("end", "", "evt_tool_stream_end", {
      target_stage_id: "plot_design",
      text: "第一幕"
    });

    const streamedTool = controller.messages.value.at(-1)?.toolCalls?.[0];
    expect(streamedTool).toMatchObject({
      id: "tool_write_1",
      name: "write_workspace_editor",
      status: "preparing",
      argumentsComplete: true,
      argumentsText: '{"target_stage_id":"plot_design","text":"第一幕"}',
      args: { target_stage_id: "plot_design", text: "第一幕" }
    });

    controller.handleEvent(
      createEnvelope(
        "tool.call_requested",
        {
          sessionId,
          runId: "run_streaming_tool",
          toolCallId: "tool_write_1",
          toolName: "write_workspace_editor",
          args: { target_stage_id: "plot_design", text: "第一幕" },
          runtime
        },
        eventOptions(
          sessionId,
          "run_streaming_tool",
          "evt_tool_execution_start"
        )
      )
    );

    expect(controller.messages.value.at(-1)?.toolCalls).toHaveLength(1);
    expect(controller.messages.value.at(-1)?.toolCalls?.[0]?.status).toBe(
      "running"
    );
    expect(controller.messages.value.at(-1)?.processingSteps).toHaveLength(1);
    controller.dispose();
  });

  it.each([
    {
      label: "write_draft_section（当前章节）",
      toolName: "write_draft_section",
      first: '{"text":"第一',
      second: '段正文"}',
      args: { text: "第一段正文" }
    },
    {
      label: "write_draft_section（指定章节）",
      toolName: "write_draft_section",
      first: '{"section_id":"section-1","text":"第一',
      second: '段正文"}',
      args: { section_id: "section-1", text: "第一段正文" }
    }
  ])(
    "streams $label content and character progress before execution",
    async ({ toolName, first, second, args }) => {
      const deferred = createDeferredApi();
      const controller = useAgentConversation({
        api: () => deferred.api,
        idleTimeoutMs: 10_000
      });
      controller.draft.value = "写正文";
      const sessionId = controller.sessionId.value;
      const runId = `run_${toolName}`;
      const streamId = `stream_${toolName}`;
      const toolCallId = `tool_${toolName}`;
      const sending = controller.sendMessage(document);
      deferred.resolveAccepted(0, {
        sessionId,
        runId,
        acceptedAt: new Date().toISOString(),
        runtime
      });
      await sending;

      const stream = (
        phase: "start" | "delta" | "end",
        argumentsDelta: string,
        eventId: string,
        completedArgs?: unknown
      ) =>
        controller.handleEvent(
          createEnvelope(
            "tool.call_stream",
            {
              sessionId,
              runId,
              streamId,
              toolCallId,
              toolName,
              phase,
              argumentsDelta,
              runtime,
              ...(completedArgs !== undefined ? { args: completedArgs } : {})
            },
            eventOptions(sessionId, runId, eventId)
          )
        );

      stream("start", first, `${toolCallId}_start`);
      expect(controller.messages.value.at(-1)?.toolCalls?.[0]).toMatchObject({
        name: toolName,
        status: "preparing",
        argumentsText: first
      });

      stream("delta", second, `${toolCallId}_delta`);
      expect(
        controller.messages.value.at(-1)?.toolCalls?.[0]?.argumentsText
      ).toBe(`${first}${second}`);

      stream("end", "", `${toolCallId}_end`, args);
      expect(controller.messages.value.at(-1)?.toolCalls?.[0]).toMatchObject({
        name: toolName,
        status: "preparing",
        argumentsComplete: true,
        args
      });
      expect(controller.messages.value.at(-1)?.processingSteps).toHaveLength(1);
      controller.dispose();
    }
  );

  it("keeps later tool streams separate when a provider repeats a stream id", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "先读取再写入";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_repeated_stream_id",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const stream = (toolCallId: string, toolName: string, eventId: string) =>
      controller.handleEvent(
        createEnvelope(
          "tool.call_stream",
          {
            sessionId,
            runId: "run_repeated_stream_id",
            streamId: "provider-content-index-0",
            toolCallId,
            toolName,
            phase: "start" as const,
            argumentsDelta: "",
            runtime
          },
          eventOptions(sessionId, "run_repeated_stream_id", eventId)
        )
      );

    stream("tool_read", "read_workspace_content", "evt_repeated_stream_read");
    stream("tool_write", "write_workspace_editor", "evt_repeated_stream_write");

    expect(controller.messages.value.at(-1)?.toolCalls).toMatchObject([
      { id: "tool_read", name: "read_workspace_content", status: "preparing" },
      { id: "tool_write", name: "write_workspace_editor", status: "preparing" }
    ]);
    expect(
      controller.messages.value
        .at(-1)
        ?.processingSteps?.filter((step) => step.type === "tool")
    ).toHaveLength(2);
    controller.dispose();
  });

  it("preserves interleaved thinking, responses, and tools in arrival order", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "按步骤处理";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_ordered",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const emit = (
      type:
        "agent.thinking_delta" | "agent.message_delta" | "tool.call_requested",
      payload: Record<string, unknown>,
      eventId: string
    ) => {
      controller.handleEvent(
        createEnvelope(
          type,
          {
            sessionId,
            runId: "run_ordered",
            runtime,
            ...payload
          } as never,
          eventOptions(sessionId, "run_ordered", eventId)
        )
      );
    };

    emit(
      "agent.thinking_delta",
      { messageId: "message_ordered", delta: "先分析。" },
      "evt_ordered_1"
    );
    emit(
      "agent.message_delta",
      { messageId: "message_ordered", delta: "先返回阶段结论。" },
      "evt_ordered_2"
    );
    emit(
      "tool.call_requested",
      {
        toolCallId: "tool_ordered_1",
        toolName: "read_file",
        args: { path: "one.md" }
      },
      "evt_ordered_3"
    );
    emit(
      "agent.thinking_delta",
      { messageId: "message_ordered", delta: "继续分析。" },
      "evt_ordered_4"
    );
    emit(
      "agent.message_delta",
      { messageId: "message_ordered", delta: "再返回阶段结论。" },
      "evt_ordered_5"
    );
    emit(
      "tool.call_requested",
      {
        toolCallId: "tool_ordered_2",
        toolName: "read_file",
        args: { path: "two.md" }
      },
      "evt_ordered_6"
    );

    expect(
      controller.messages.value
        .at(-1)
        ?.processingSteps?.map((step) => step.type)
    ).toEqual(["thinking", "response", "tool", "thinking", "response", "tool"]);

    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId: "run_ordered",
          messageId: "message_ordered",
          role: "assistant" as const,
          content: "这是最后一段返回信息。",
          runtime
        },
        eventOptions(sessionId, "run_ordered", "evt_ordered_complete")
      )
    );

    const message = controller.messages.value.at(-1);
    expect(message?.processingSteps?.map((step) => step.type)).toEqual([
      "thinking",
      "response",
      "tool",
      "thinking",
      "response",
      "tool",
      "response"
    ]);
    expect(
      message?.processingSteps
        ?.filter((step) => step.type === "response")
        .map((step) => step.content)
    ).toEqual([
      "先返回阶段结论。",
      "再返回阶段结论。",
      "这是最后一段返回信息。"
    ]);
    expect(message?.content).toBe("这是最后一段返回信息。");
    controller.dispose();
  });
});
