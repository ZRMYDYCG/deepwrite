import {
  ActiveResourceSnapshotSchema,
  AgentEvaluationSnapshotEventEnvelopeSchema,
  AgentMessageDeltaEventEnvelopeSchema,
  AgentRetryScheduledEventEnvelopeSchema,
  AgentTurnStartedEventEnvelopeSchema,
  AgentUsageObservedEventEnvelopeSchema,
  ExpertDraftFileSnapshotSchema,
  ExpertDraftSchema,
  PromptTextAttachmentSchema,
  SHORT_WORKSPACE_FILE_MAX_CHARACTERS,
  ShortCharacterItemSnapshotSchema,
  ShortWorkspaceStageSnapshotSchema,
  SubagentActivitySchema,
  SystemEventEnvelopeSchema,
  UtilityInboundMessageSchema,
  UtilityOutboundMessageSchema,
  WorkspaceEditorMutationPayloadSchema,
  createEnvelope,
  createShortWorkspaceContentRevision,
  describe,
  expect,
  it,
  runtime
} from "./index.test-support";

describe("DeepWrite desktop contracts: events-and-draft-mutations", () => {
  it("validates an evaluation snapshot tied to its run and assistant message", () => {
    const context = { sessionId: "session_eval", runId: "run_eval" };
    const snapshot = createEnvelope(
      "agent.evaluation_snapshot",
      {
        ...context,
        messageId: "run_eval_assistant",
        runtime,
        snapshot: {
          schemaVersion: 1 as const,
          capturedAt: "2026-08-13T00:00:00.000Z",
          systemPrompt: "最终系统提示词",
          runtimeContext: {
            kind: "initial-session-context" as const,
            text: "运行时注入文本"
          },
          tools: [
            {
              name: "read_fixture",
              label: "读取夹具",
              description: "读取测试夹具。",
              inputSchema: {
                type: "object",
                properties: { id: { type: "string" } },
                required: ["id"]
              }
            }
          ],
          conversationHistory: [{ role: "user", text: "运行时注入文本" }]
        }
      },
      { id: "event_eval", context }
    );

    expect(
      AgentEvaluationSnapshotEventEnvelopeSchema.parse(snapshot).payload
        .snapshot.conversationHistory
    ).toEqual([{ role: "user", text: "运行时注入文本" }]);
    expect(SystemEventEnvelopeSchema.parse(snapshot).type).toBe(
      "agent.evaluation_snapshot"
    );
  });

  it("validates internal assistant usage observations without making them UI terminal events", () => {
    const context = { sessionId: "session_usage", runId: "run_usage" };
    const observed = createEnvelope(
      "agent.usage_observed",
      {
        ...context,
        messageId: "run_usage_assistant",
        observationId: "run_usage:turn:1:attempt:1",
        observedAt: "2026-07-29T10:00:00.000Z",
        turnId: "run_usage:turn:1",
        attempt: 1,
        status: "completed" as const,
        hadToolCall: true,
        usage: {
          inputTokens: 13,
          outputTokens: 5,
          cacheReadTokens: 2,
          cacheWriteTokens: 0,
          totalTokens: 20
        },
        runtime: {
          provider: "openai",
          model: "gpt-test",
          mode: "provider" as const,
          configId: "model-config-1"
        }
      },
      { id: "event_usage", context }
    );

    expect(
      AgentUsageObservedEventEnvelopeSchema.parse(observed).payload
    ).toMatchObject({
      observationId: "run_usage:turn:1:attempt:1",
      hadToolCall: true,
      runtime: { configId: "model-config-1" }
    });
    expect(SystemEventEnvelopeSchema.parse(observed).type).toBe(
      "agent.usage_observed"
    );
  });

  it("validates turn attempts and scheduled retries as non-terminal agent events", () => {
    const context = { sessionId: "session_retry", runId: "run_retry" };
    const turnStarted = createEnvelope(
      "agent.turn_started",
      {
        ...context,
        messageId: "message_retry",
        turnId: "turn_retry",
        attempt: 1,
        maxAttempts: 6,
        runtime
      },
      { id: "event_turn_started", context }
    );
    const retryScheduled = createEnvelope(
      "agent.retry_scheduled",
      {
        ...context,
        messageId: "message_retry",
        turnId: "turn_retry",
        failedAttempt: 1,
        nextAttempt: 2,
        maxAttempts: 6,
        delayMs: 2_000,
        retryAt: "2026-07-26T12:00:02.000Z",
        reason: "Network connection reset.",
        runtime
      },
      { id: "event_retry_scheduled", context }
    );

    expect(
      AgentTurnStartedEventEnvelopeSchema.parse(turnStarted).payload.attempt
    ).toBe(1);
    expect(
      AgentRetryScheduledEventEnvelopeSchema.parse(retryScheduled).payload
        .nextAttempt
    ).toBe(2);
    expect(SystemEventEnvelopeSchema.parse(turnStarted).type).toBe(
      "agent.turn_started"
    );
    expect(SystemEventEnvelopeSchema.parse(retryScheduled).type).toBe(
      "agent.retry_scheduled"
    );
    expect(
      UtilityOutboundMessageSchema.parse({
        kind: "utility.command.event",
        worker: "agent",
        requestId: "request_retry",
        event: retryScheduled
      }).kind
    ).toBe("utility.command.event");

    expect(() =>
      AgentTurnStartedEventEnvelopeSchema.parse({
        ...turnStarted,
        payload: { ...turnStarted.payload, attempt: 7 }
      })
    ).toThrow();
    expect(() =>
      AgentRetryScheduledEventEnvelopeSchema.parse({
        ...retryScheduled,
        payload: { ...retryScheduled.payload, nextAttempt: 3 }
      })
    ).toThrow();
  });

  it("validates subagent retry lifecycle activities", () => {
    expect(
      SubagentActivitySchema.parse({
        type: "turn_started",
        turnId: "subagent_turn_1",
        attempt: 2,
        maxAttempts: 6
      })
    ).toMatchObject({ type: "turn_started", attempt: 2 });
    expect(
      SubagentActivitySchema.parse({
        type: "retry_scheduled",
        turnId: "subagent_turn_1",
        failedAttempt: 2,
        nextAttempt: 3,
        maxAttempts: 6,
        delayMs: 5_000,
        retryAt: "2026-07-26T12:00:05.000Z",
        reason: "Provider temporarily unavailable."
      })
    ).toMatchObject({ type: "retry_scheduled", nextAttempt: 3 });

    expect(() =>
      SubagentActivitySchema.parse({
        type: "retry_scheduled",
        turnId: "subagent_turn_1",
        failedAttempt: 6,
        nextAttempt: 7,
        maxAttempts: 6,
        delayMs: 30_000,
        retryAt: "2026-07-26T12:00:30.000Z",
        reason: "Provider temporarily unavailable."
      })
    ).toThrow();
  });

  it("rejects an event whose run context differs from its payload", () => {
    const event = createEnvelope(
      "agent.message_delta",
      {
        sessionId: "session_1",
        runId: "run_1",
        messageId: "message_1",
        delta: "内容",
        runtime
      },
      {
        id: "event_bad_run",
        context: { sessionId: "session_1", runId: "run_2" }
      }
    );

    expect(() => AgentMessageDeltaEventEnvelopeSchema.parse(event)).toThrow();
  });

  it("validates targeted expert-draft file mutations", () => {
    const event = createEnvelope(
      "workspace.editor_mutation",
      {
        sessionId: "session_section_mutation",
        runId: "run_section_mutation",
        toolCallId: "tool_section_mutation",
        workspaceId: "book-1",
        stageId: "draft" as const,
        text: "第三节的新正文。",
        mutationTarget: {
          kind: "expert-draft-file" as const,
          documentId: "draft:section-3:body",
          sectionId: "section-3",
          fileKind: "body" as const
        },
        baseRevision: "v1:100:1234abcd",
        summary: "已生成第三节正文变更。",
        runtime
      },
      {
        id: "event_section_mutation",
        context: {
          sessionId: "session_section_mutation",
          runId: "run_section_mutation"
        }
      }
    );

    expect(SystemEventEnvelopeSchema.parse(event)).toMatchObject({
      payload: {
        mutationTarget: {
          documentId: "draft:section-3:body",
          sectionId: "section-3",
          fileKind: "body"
        }
      }
    });
    expect(() =>
      SystemEventEnvelopeSchema.parse({
        ...event,
        payload: { ...event.payload, stageId: "outline" }
      })
    ).toThrow();
    expect(() =>
      SystemEventEnvelopeSchema.parse({
        ...event,
        payload: { ...event.payload, mutationTarget: undefined }
      })
    ).toThrow();
  });

  it("validates batch expert-draft section creation mutations", () => {
    const payload = {
      sessionId: "session_section_creation",
      runId: "run_section_creation",
      toolCallId: "tool_section_creation",
      workspaceId: "book-1",
      stageId: "draft" as const,
      text: "1. 第二章（1200 字）\n2. 第三章",
      mutationTarget: {
        kind: "expert-draft-section-creation" as const,
        sections: [
          {
            title: "第二章",
            wordCountRequirement: "1200 字",
            provisionalSectionId: "pending:section:1",
            bodyContent: "第二章正文。",
            characterStateContent: "人物在章末掌握了新线索。"
          },
          {
            title: "第三章",
            wordCountRequirement: "",
            provisionalSectionId: "pending:section:2"
          }
        ],
        afterSectionId: "section-1"
      },
      baseRevision: "v1:100:1234abcd",
      summary: "已生成创建 2 个空白章节文件的变更。",
      runtime
    };

    expect(WorkspaceEditorMutationPayloadSchema.parse(payload)).toMatchObject({
      mutationTarget: {
        kind: "expert-draft-section-creation",
        sections: [
          {
            title: "第二章",
            provisionalSectionId: "pending:section:1",
            bodyContent: "第二章正文。",
            characterStateContent: "人物在章末掌握了新线索。"
          },
          { title: "第三章", provisionalSectionId: "pending:section:2" }
        ]
      }
    });
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...payload,
        mutationTarget: { ...payload.mutationTarget, sections: [] }
      }).success
    ).toBe(false);
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...payload,
        stageId: "outline"
      }).success
    ).toBe(false);
  });

  it("validates create-with-content targets for characters and plot stages", () => {
    const base = {
      sessionId: "session_structure_creation",
      runId: "run_structure_creation",
      toolCallId: "tool_structure_creation",
      workspaceId: "book-1",
      baseRevision: "v1:100:1234abcd",
      summary: "创建结构与正文。",
      runtime
    };
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...base,
        stageId: "character_design",
        text: "创建：林默",
        mutationTarget: {
          kind: "character-structure",
          initialContent: "林默是守夜人。",
          mutation: {
            type: "createItem",
            title: "林默",
            provisionalItemId: "character_pending_1"
          }
        }
      }).success
    ).toBe(true);
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...base,
        stageId: "plot_design",
        text: "失踪名单记录了旧船员。",
        mutationTarget: {
          kind: "plot-structure",
          mutation: {
            type: "create",
            title: "真相回收",
            description: "回收线索并揭示真相。",
            provisionalStageId: "pending:plot-stage:1",
            content: "失踪名单记录了旧船员。"
          }
        }
      }).success
    ).toBe(true);
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...base,
        stageId: "draft",
        text: "失踪名单记录了旧船员。",
        mutationTarget: {
          kind: "plot-structure",
          mutation: {
            type: "create",
            title: "真相回收",
            description: "回收线索并揭示真相。",
            provisionalStageId: "pending:plot-stage:1",
            content: "失踪名单记录了旧船员。"
          }
        }
      }).success
    ).toBe(false);
  });

  it("validates expert-draft section rename mutations", () => {
    const payload = {
      sessionId: "session_section_rename",
      runId: "run_section_rename",
      toolCallId: "tool_section_rename",
      workspaceId: "book-1",
      stageId: "draft" as const,
      text: "旧章名 → 新章名",
      mutationTarget: {
        kind: "expert-draft-section-rename" as const,
        sectionId: "section-1",
        previousTitle: "旧章名",
        title: "新章名"
      },
      baseRevision: "v1:100:1234abcd",
      summary: "已生成章节改名变更。",
      runtime
    };

    expect(WorkspaceEditorMutationPayloadSchema.parse(payload)).toMatchObject({
      mutationTarget: {
        kind: "expert-draft-section-rename",
        sectionId: "section-1",
        previousTitle: "旧章名",
        title: "新章名"
      }
    });
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...payload,
        mutationTarget: {
          ...payload.mutationTarget,
          title: ""
        }
      }).success
    ).toBe(false);
  });

  it("validates expert-draft section deletion mutations", () => {
    const payload = {
      sessionId: "session_section_deletion",
      runId: "run_section_deletion",
      toolCallId: "tool_section_deletion",
      workspaceId: "book-1",
      stageId: "draft" as const,
      text: "删除：旧章名",
      mutationTarget: {
        kind: "expert-draft-section-deletion" as const,
        sectionId: "section-1",
        title: "旧章名"
      },
      baseRevision: "v1:100:1234abcd",
      summary: "已生成章节删除变更。",
      runtime
    };

    expect(WorkspaceEditorMutationPayloadSchema.parse(payload)).toMatchObject({
      mutationTarget: {
        kind: "expert-draft-section-deletion",
        sectionId: "section-1",
        title: "旧章名"
      }
    });
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...payload,
        mutationTarget: {
          ...payload.mutationTarget,
          title: ""
        }
      }).success
    ).toBe(false);
  });

  it("validates command and event messages at the Utility boundary", () => {
    const command = createEnvelope(
      "session.prompt",
      { sessionId: "session_1", message: "分析人物动机" },
      { id: "cmd_utility", context: { sessionId: "session_1" } }
    );
    const event = createEnvelope(
      "agent.message_delta",
      {
        sessionId: "session_1",
        runId: "run_1",
        messageId: "message_1",
        delta: "正在分析",
        runtime
      },
      {
        id: "event_utility",
        context: { sessionId: "session_1", runId: "run_1" }
      }
    );

    expect(
      UtilityInboundMessageSchema.parse({
        kind: "utility.command.request",
        requestId: "request_1",
        command
      }).kind
    ).toBe("utility.command.request");
    expect(
      UtilityOutboundMessageSchema.parse({
        kind: "utility.command.event",
        worker: "agent",
        requestId: "request_1",
        event
      }).kind
    ).toBe("utility.command.event");

    const internalCommand = createEnvelope(
      "system.health",
      {},
      { id: "cmd_internal_health" }
    );
    expect(
      UtilityOutboundMessageSchema.parse({
        kind: "utility.internal.command.request",
        worker: "agent",
        target: "core",
        requestId: "internal_request_1",
        parentRequestId: "request_1",
        timeoutMs: 5_000,
        command: internalCommand
      }).kind
    ).toBe("utility.internal.command.request");
    expect(
      UtilityInboundMessageSchema.parse({
        kind: "utility.internal.command.result",
        worker: "agent",
        target: "core",
        requestId: "internal_request_1",
        parentRequestId: "request_1",
        result: {
          status: "accepted",
          requestId: internalCommand.id,
          payload: { status: "ok" }
        }
      }).kind
    ).toBe("utility.internal.command.result");
    expect(
      UtilityOutboundMessageSchema.safeParse({
        kind: "utility.internal.command.request",
        worker: "core",
        target: "tool",
        requestId: "internal_request_wrong_source",
        parentRequestId: "request_1",
        timeoutMs: 5_000,
        command: internalCommand
      }).success
    ).toBe(false);
    expect(
      UtilityOutboundMessageSchema.safeParse({
        kind: "utility.internal.command.request",
        worker: "agent",
        target: "agent",
        requestId: "internal_request_loop",
        parentRequestId: "request_1",
        timeoutMs: 5_000,
        command: internalCommand
      }).success
    ).toBe(false);
  });

  it("validates streamed tool arguments before tool execution", () => {
    const event = createEnvelope(
      "tool.call_stream",
      {
        sessionId: "session_tool_stream",
        runId: "run_tool_stream",
        streamId: "message_tool_stream:0",
        toolCallId: "tool_write_1",
        toolName: "write_workspace_editor",
        phase: "delta" as const,
        argumentsDelta: '{"text":"开场',
        runtime
      },
      {
        id: "event_tool_stream",
        context: { sessionId: "session_tool_stream", runId: "run_tool_stream" }
      }
    );

    expect(SystemEventEnvelopeSchema.parse(event).type).toBe(
      "tool.call_stream"
    );
  });

  it("requires truthful truncation metadata for a shortened live snapshot", () => {
    const snapshot = {
      id: "chapter_long",
      domain: "creation" as const,
      title: "长章节",
      path: ["作品", "长章节"],
      source: "live-editor" as const,
      content: "字".repeat(20_000),
      truncated: true,
      originalLength: 20_010
    };

    expect(ActiveResourceSnapshotSchema.parse(snapshot).originalLength).toBe(
      20_010
    );
    expect(() =>
      ActiveResourceSnapshotSchema.parse({
        ...snapshot,
        originalLength: 20_000
      })
    ).toThrow();
    expect(() =>
      ActiveResourceSnapshotSchema.parse({
        ...snapshot,
        truncated: false,
        originalLength: 20_010
      })
    ).toThrow();
    const { truncated: _truncated, ...withoutTruncated } = snapshot;
    expect(() =>
      ActiveResourceSnapshotSchema.parse(withoutTruncated)
    ).toThrow();
  });

  it("requires truthful truncation metadata across bounded text snapshots", () => {
    const revision = createShortWorkspaceContentRevision("前段");
    const bounded = { content: "前段", truncated: true, originalLength: 10 };

    expect(() =>
      ShortWorkspaceStageSnapshotSchema.parse({
        stageId: "outline",
        title: "大纲",
        revision,
        ...bounded
      })
    ).not.toThrow();
    expect(() =>
      ShortWorkspaceStageSnapshotSchema.parse({
        stageId: "outline",
        title: "大纲",
        revision,
        content: "前段",
        originalLength: 10
      })
    ).toThrow();

    expect(() =>
      ShortCharacterItemSnapshotSchema.parse({
        id: "character-1",
        title: "林默",
        order: 1,
        revision,
        ...bounded
      })
    ).not.toThrow();
    expect(() =>
      ShortCharacterItemSnapshotSchema.parse({
        id: "character-1",
        title: "林默",
        order: 1,
        revision,
        content: "前段",
        truncated: true
      })
    ).toThrow();

    expect(() =>
      PromptTextAttachmentSchema.parse({
        id: "attachment-1",
        kind: "text",
        name: "资料.txt",
        mediaType: "text/plain",
        size: 10,
        content: "前段",
        originalLength: 10
      })
    ).toThrow();
  });

  it("uses one 32 MiB character boundary across stored and runtime text files", () => {
    const atLimit = "a".repeat(SHORT_WORKSPACE_FILE_MAX_CHARACTERS);
    const overLimit = `${atLimit}a`;
    const revision = "v1:0:811c9dc5";
    const draftSection = {
      id: "section-1",
      title: "第一节",
      wordCountRequirement: "",
      body: atLimit,
      characterState: ""
    };
    const draftFile = {
      documentId: "d".repeat(4_096),
      title: "第一节·正文",
      content: atLimit,
      revision
    };
    const activeResource = {
      id: "draft:section-1:body",
      domain: "creation" as const,
      title: "第一节·正文",
      path: ["正文", "第一节", "正文"],
      source: "live-editor" as const,
      content: atLimit
    };
    const stage = {
      stageId: "outline" as const,
      title: "大纲",
      content: atLimit,
      revision
    };
    const mutation = {
      sessionId: "session-boundary",
      runId: "run-boundary",
      toolCallId: "tool-boundary",
      workspaceId: "book-boundary",
      stageId: "draft" as const,
      text: atLimit,
      mutationTarget: {
        kind: "expert-draft-file" as const,
        documentId: "d".repeat(4_096),
        sectionId: "section-1",
        fileKind: "body" as const
      },
      baseRevision: revision,
      summary: "边界写入",
      runtime
    };

    expect(
      ExpertDraftSchema.safeParse({ sections: [draftSection] }).success
    ).toBe(true);
    expect(ExpertDraftFileSnapshotSchema.safeParse(draftFile).success).toBe(
      true
    );
    expect(
      ExpertDraftFileSnapshotSchema.safeParse({
        ...draftFile,
        title: "节".repeat(256),
        content: ""
      }).success
    ).toBe(true);
    expect(ActiveResourceSnapshotSchema.safeParse(activeResource).success).toBe(
      true
    );
    expect(
      ActiveResourceSnapshotSchema.safeParse({
        ...activeResource,
        content: "",
        truncated: true,
        originalLength: SHORT_WORKSPACE_FILE_MAX_CHARACTERS
      }).success
    ).toBe(true);
    expect(ShortWorkspaceStageSnapshotSchema.safeParse(stage).success).toBe(
      true
    );
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse(mutation).success
    ).toBe(true);

    expect(
      ExpertDraftSchema.safeParse({
        sections: [{ ...draftSection, body: overLimit }]
      }).success
    ).toBe(false);
    expect(
      ExpertDraftFileSnapshotSchema.safeParse({
        ...draftFile,
        content: overLimit
      }).success
    ).toBe(false);
    expect(
      ExpertDraftFileSnapshotSchema.safeParse({
        ...draftFile,
        documentId: "d".repeat(4_097),
        content: ""
      }).success
    ).toBe(false);
    expect(
      ExpertDraftFileSnapshotSchema.safeParse({
        ...draftFile,
        title: "节".repeat(257),
        content: ""
      }).success
    ).toBe(false);
    expect(
      ActiveResourceSnapshotSchema.safeParse({
        ...activeResource,
        content: "",
        originalLength: SHORT_WORKSPACE_FILE_MAX_CHARACTERS + 1
      }).success
    ).toBe(false);
    expect(
      ShortWorkspaceStageSnapshotSchema.safeParse({
        ...stage,
        content: overLimit
      }).success
    ).toBe(false);
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...mutation,
        text: overLimit
      }).success
    ).toBe(false);
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...mutation,
        text: "",
        mutationTarget: {
          ...mutation.mutationTarget,
          documentId: "d".repeat(4_097)
        }
      }).success
    ).toBe(false);
  });
});
