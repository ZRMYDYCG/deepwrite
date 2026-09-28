import {
  CommandEnvelopeSchema,
  EXTRAS_AGENT_USAGE_MODULES,
  SessionPromptAcceptedPayloadSchema,
  assertExtrasAgentBudget,
  createEnvelope,
  isDeepSeekWebSearchCompatible,
  type AgentProviderRuntimeConfig,
  type AgentRuntimeRef,
  type CommandEnvelope,
  type CommandResult,
  type ExtrasAgentRunSpec,
  type ExtrasAgentTask
} from "@deepwrite/contracts";
import {
  withCompactionUsageConfig,
  type ContextCompactionRun
} from "../../main/context-compaction-run";
import { resolveModelRunSettings } from "../../main/model-run-settings";
import {
  createUsageRunContext,
  type UsageRunContext
} from "../../main/usage-observation";
import type { ChatRuntimeSources } from "./chat/runtime-snapshot";
import type { ExtrasAgentConfigStore } from "./config-store";
import { resolveExtrasTask } from "./task-resolver";

type ExtrasAgentRunCommand = Extract<
  CommandEnvelope,
  { type: "extrasAgent.run" }
>;

/** The subset of Main's run registry an extras run needs. */
export interface ExtrasAgentActiveRun {
  sessionId: string;
  correlationId: string;
  runtime: AgentRuntimeRef;
  accepted: boolean;
  promptRequestId?: string;
  resourceId?: string;
  usageContext?: UsageRunContext;
}

export interface ExtrasAgentRunDependencies {
  configStore(): ExtrasAgentConfigStore;
  chatSources: ChatRuntimeSources;
  resolveModel(
    modelId: string | undefined
  ): Promise<AgentProviderRuntimeConfig | undefined>;
  /** Compaction settings for conversation agents; one-shot tasks never compact. */
  resolveContextCompaction(
    runModelId: string | undefined
  ): Promise<ContextCompactionRun>;
  requestAgent(command: CommandEnvelope): Promise<CommandResult>;
  /**
   * Holds the conversation against history management until the run is
   * registered; undefined while that conversation's history is being managed.
   */
  acquireConversation(sessionId: string): (() => void) | undefined;
  activeRuns: Map<string, ExtrasAgentActiveRun>;
  terminalRuns: ReadonlySet<string>;
  pendingUsageContexts: Map<string, UsageRunContext>;
}

function rejected(
  command: CommandEnvelope,
  message: string,
  code = "extras_agent.run_failed"
): CommandResult {
  return {
    status: "rejected",
    requestId: command.id,
    error: { code, message }
  };
}

function assertWebSearchSupported(
  task: ExtrasAgentTask,
  runtimeConfig: AgentProviderRuntimeConfig | undefined
): void {
  const requested =
    "webSearchEnabled" in task.input && task.input.webSearchEnabled === true;
  if (requested && !isDeepSeekWebSearchCompatible(runtimeConfig)) {
    throw new Error(
      "智能搜索仅支持 Provider 为 DeepSeek，且 API 类型为 OpenAI Responses 或 Anthropic Messages 的模型。"
    );
  }
}

/**
 * Resolves the saved profile, model and budget for a "更多功能" run and hands
 * the authoritative spec to the Agent Utility. Mirrors `session.prompt`
 * bookkeeping so usage, aborts and busy checks see extras runs too.
 */
export async function runExtrasAgent(
  deps: ExtrasAgentRunDependencies,
  command: ExtrasAgentRunCommand
): Promise<CommandResult> {
  const { correlationId } = command.context;
  const { task, conversation, sessionId } = command.payload;
  const release = conversation
    ? deps.acquireConversation(sessionId)
    : () => undefined;
  if (!release) {
    return rejected(
      command,
      "此对话正在管理历史，请稍后重试。",
      "conversation_history.busy"
    );
  }
  try {
    const runtimeConfig = await deps.resolveModel(command.payload.modelId);
    assertWebSearchSupported(task, runtimeConfig);
    const resolution = await resolveExtrasTask(
      deps.configStore(),
      deps.chatSources,
      task
    );
    assertExtrasAgentBudget(resolution.task, runtimeConfig);
    const { thinkingLevel, temperature } = resolveModelRunSettings(
      runtimeConfig,
      {
        thinkingLevel: command.payload.thinkingLevel,
        temperature: command.payload.temperature
      }
    );
    const compaction = conversation
      ? await deps.resolveContextCompaction(runtimeConfig?.id)
      : undefined;
    const spec: ExtrasAgentRunSpec = {
      sessionId,
      ...(runtimeConfig ? { runtimeConfig } : {}),
      ...(thinkingLevel ? { thinkingLevel } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      task: resolution.task,
      ...(conversation ? { conversation } : {}),
      ...compaction
    };
    const usageContext = createUsageRunContext(
      EXTRAS_AGENT_USAGE_MODULES[task.agentId],
      runtimeConfig,
      compaction ? withCompactionUsageConfig({}, compaction) : {}
    );
    deps.pendingUsageContexts.set(correlationId, usageContext);
    const internalCommand = CommandEnvelopeSchema.parse(
      createEnvelope("agent.extras_run", spec, {
        id: command.id,
        context: command.context
      })
    );
    const result = await deps.requestAgent(internalCommand);
    if (result.status !== "accepted") return result;
    const accepted = SessionPromptAcceptedPayloadSchema.parse(result.payload);
    const provisional = [...deps.activeRuns.entries()].find(
      ([, run]) => run.correlationId === correlationId
    );
    if (
      accepted.sessionId !== sessionId ||
      (provisional && provisional[0] !== accepted.runId)
    ) {
      return rejected(
        command,
        "Agent acceptance does not match the extras agent run.",
        "ipc.invalid_agent_acceptance"
      );
    }
    if (!deps.terminalRuns.has(accepted.runId)) {
      deps.activeRuns.set(accepted.runId, {
        sessionId: accepted.sessionId,
        correlationId,
        runtime: accepted.runtime,
        accepted: true,
        promptRequestId: internalCommand.id,
        ...(resolution.resourceId ? { resourceId: resolution.resourceId } : {}),
        usageContext
      });
    }
    return { status: "accepted", requestId: command.id, payload: accepted };
  } catch (error: unknown) {
    return rejected(
      command,
      error instanceof Error ? error.message : "启动智能体失败。"
    );
  } finally {
    deps.pendingUsageContexts.delete(correlationId);
    release();
  }
}
