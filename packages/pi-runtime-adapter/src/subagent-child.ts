import { randomBytes } from "node:crypto";
import {
  Agent,
  type AgentMessage,
  type AgentToolResult,
  type StreamFn
} from "@earendil-works/pi-agent-core";
import type { AgentRuntimeRef } from "@deepwrite/contracts";
import { runSubagentLifecycle } from "./subagent-lifecycle";
import { waitForSubagentPreparation } from "./subagent-preparation";
import { snapshotSubagentHistory } from "./subagent-history";
import {
  buildSubagentSystemPrompt,
  textResult,
  runtimeFromConfig,
  runtimeFromModel,
  SUBAGENT_SUMMARY_MAX_LENGTH
} from "./subagent-helpers";
import type { SubagentHandoff } from "./subagent-scheduler";
import type {
  BuildSpawnSubagentToolInput,
  SubagentBatchTaskRef,
  SubagentProgressBase,
  SubagentTaskOutcome,
  SubagentTaskRequest,
  SubagentToolDetails,
  SubagentToolProgress
} from "./subagent-types";
import {
  applySubagentWriteScope,
  subagentWriteScopeNote,
  type SubagentWriteLock
} from "./subagent-write-scope";

const HANDOFF_SUMMARY_MAX_LENGTH = 6_000;

export interface SubagentTaskContext {
  parentToolCallId: string;
  request: SubagentTaskRequest;
  /** Present when the call submitted more than one task. */
  batchTask?: SubagentBatchTaskRef;
  signal?: AbortSignal;
  writeLock: SubagentWriteLock;
  onUpdate?: (partialResult: AgentToolResult<SubagentToolDetails>) => void;
}

export function childRuntime(
  input: BuildSpawnSubagentToolInput,
  request: SubagentTaskRequest
): AgentRuntimeRef {
  const modelId =
    request.definition.modelMode === "custom"
      ? request.definition.modelId?.trim()
      : undefined;
  const config = modelId ? input.subagentRuntimeConfigs?.[modelId] : undefined;
  return config
    ? runtimeFromConfig(config)
    : (input.parentRuntime ?? runtimeFromModel(input.model));
}

function progressBase(
  input: BuildSpawnSubagentToolInput,
  context: SubagentTaskContext
): SubagentProgressBase {
  return {
    parentToolCallId: context.parentToolCallId,
    subagentRunId:
      input.createRunId?.() ?? `subrun_${randomBytes(4).toString("hex")}`,
    subagentId: context.request.definition.id,
    name: context.request.definition.name,
    runtime: childRuntime(input, context.request),
    ...(context.batchTask ? { batchTask: context.batchTask } : {})
  };
}

function emitter(context: SubagentTaskContext) {
  return (progress: SubagentToolProgress, text: string): void => {
    context.onUpdate?.(
      textResult(text, { kind: "subagent-progress", progress })
    );
  };
}

/** Terminal event for a task the scheduler never started. */
export function reportUnstartedSubagentTask(
  input: BuildSpawnSubagentToolInput,
  context: SubagentTaskContext,
  outcome: SubagentTaskOutcome
): void {
  emitter(context)(
    {
      ...progressBase(input, context),
      type: "completed",
      status: outcome.status,
      summary: outcome.summary,
      errorMessage: outcome.summary.slice(0, 4_000)
    },
    outcome.summary
  );
}

function handoffMessage(handoffs: readonly SubagentHandoff[]): AgentMessage {
  return {
    role: "user",
    content: [
      "【前置任务交接】本任务依赖的前置子任务已经完成，以下是它们的交接摘要，按需参考：",
      ...handoffs.map(
        (handoff) =>
          `### ${handoff.key}（${handoff.name}）\n${handoff.summary.slice(0, HANDOFF_SUMMARY_MAX_LENGTH)}`
      )
    ].join("\n\n"),
    timestamp: Date.now()
  };
}

/** Builds a fresh, uncached child Agent for one task and runs it to the end. */
export async function runSubagentTask(
  input: BuildSpawnSubagentToolInput,
  context: SubagentTaskContext,
  handoffs: readonly SubagentHandoff[]
): Promise<SubagentTaskOutcome> {
  const { request, signal } = context;
  const definition = request.definition;
  const libraryManager = definition.toolSource === "library-management";
  const childMessages =
    definition.contextMode === "parent-snapshot"
      ? snapshotSubagentHistory(input.getParentMessages?.() ?? [])
      : [];
  if (!libraryManager && input.materialContext?.trim()) {
    childMessages.push({
      role: "user",
      content: `【本轮可按需读取的素材上下文】\n${input.materialContext.trim()}`,
      timestamp: Date.now()
    });
  }
  if (handoffs.length > 0) childMessages.push(handoffMessage(handoffs));
  const base = progressBase(input, context);
  const emitProgress = emitter(context);
  emitProgress(
    { ...base, type: "started", task: request.task },
    `子智能体「${definition.name}」已开始执行。`
  );

  const compactionListeners = new Set<() => void>();
  let childContextPolicy = input.contextPolicy;
  let child: Agent;
  try {
    let childModel = input.model;
    let childStreamFn = input.streamFn;
    let childThinkingLevel = input.thinkingLevel;
    if (definition.modelMode === "custom") {
      const modelId = definition.modelId?.trim();
      if (!modelId) {
        throw new Error(`子智能体「${definition.name}」未配置模型。`);
      }
      const runtimeConfig = input.subagentRuntimeConfigs?.[modelId];
      if (!runtimeConfig) {
        throw new Error(
          `子智能体「${definition.name}」配置的模型不可用，请重新保存智能体团队或刷新模型配置。`
        );
      }
      if (!input.buildCustomModelRuntime) {
        throw new Error("当前运行时不支持子智能体单独配置模型。");
      }
      const customRuntime = input.buildCustomModelRuntime(runtimeConfig, {
        ...(definition.thinkingLevel !== undefined
          ? { thinkingLevel: definition.thinkingLevel }
          : {}),
        ...(definition.temperature !== undefined
          ? { temperature: definition.temperature }
          : {})
      });
      childModel = customRuntime.model;
      childStreamFn = customRuntime.streamFn;
      childThinkingLevel = customRuntime.thinkingLevel;
    }
    const prepared = libraryManager
      ? await waitForSubagentPreparation(
          input.prepareChild?.(definition, request.libraryId, signal),
          signal
        )
      : undefined;
    signal?.throwIfAborted();
    if (libraryManager && !prepared)
      throw new Error("资料库管理运行上下文不可用。");
    if (prepared?.contextPolicy) childContextPolicy = prepared.contextPolicy;
    const childTools = applySubagentWriteScope(
      (
        prepared?.tools ??
        input.buildChildTools((listener) => compactionListeners.add(listener))
      ).filter(
        (tool) =>
          tool.name !== "spawn_subagent" &&
          (libraryManager ||
            (tool.name !== "load_skill" && tool.name !== "ask_user_question"))
      ),
      request.writeScope,
      context.writeLock
    );
    if (libraryManager) {
      for (const [index, tool] of childTools.entries()) {
        childTools[index] = {
          ...tool,
          execute: (toolCallId, args, signal, onUpdate) =>
            tool.execute(
              `${base.subagentRunId}:${toolCallId}`,
              args,
              signal,
              onUpdate
            )
        };
      }
    }
    const childDefinition = prepared
      ? { ...definition, systemPrompt: prepared.systemPrompt }
      : definition;
    const childStreamWithoutProviderRetries: StreamFn = (
      requestModel,
      streamContext,
      options
    ) =>
      childStreamFn(requestModel, streamContext, {
        ...options,
        // The visible turn coordinator owns the complete retry budget. Keep
        // provider SDK retries disabled for inherited and custom child models
        // as well, otherwise one child attempt can fan out into 2+ requests.
        maxRetries: 0
      });
    child = new Agent({
      initialState: {
        systemPrompt: buildSubagentSystemPrompt(
          childDefinition,
          childTools,
          prepared ? undefined : input.systemPromptRequirements,
          subagentWriteScopeNote(request.writeScope)
        ),
        model: childModel,
        thinkingLevel: childThinkingLevel,
        messages: childMessages,
        // buildChildTools() creates fresh read evidence while closing over the
        // same parent-run mutation/revision overlay.
        tools: childTools
      },
      streamFn: childStreamWithoutProviderRetries,
      sessionId: `${input.parentSessionId}:${base.subagentRunId}`,
      toolExecution: "sequential",
      ...input.toolExecutionHooks
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "子智能体初始化失败。";
    const status = signal?.aborted ? "aborted" : "error";
    const summary =
      `${signal?.aborted ? "子智能体执行已中止" : "子智能体执行失败"}：${errorMessage}`.slice(
        0,
        SUBAGENT_SUMMARY_MAX_LENGTH
      );
    emitProgress(
      {
        ...base,
        type: "completed",
        status,
        summary,
        errorMessage: errorMessage.slice(0, 4_000)
      },
      summary
    );
    return { status, summary };
  }

  return runSubagentLifecycle(
    child,
    {
      ...input,
      ...(childContextPolicy ? { contextPolicy: childContextPolicy } : {})
    },
    base,
    request.task,
    base.runtime!,
    emitProgress,
    signal,
    () => {
      for (const listener of compactionListeners) listener();
    }
  );
}
