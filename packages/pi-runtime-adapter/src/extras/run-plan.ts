import {
  assertExtrasAgentBudget,
  type ExtrasAgentResolvedTask,
  type ExtrasAgentRunSpec
} from "@deepwrite/contracts";
import type { ContextPolicy } from "../kernel/context";
import type { AgentRunPlan, AgentRunTarget } from "../kernel/run-plan";
import type { LongCommandExecutor } from "../long-agent-tools";
import { rawUserMessageContent } from "../prompts-user-message";
import type { AgentRuntimeEvent } from "../runtime-types";
import { chatNormalAgent } from "./agents/chat-normal";
import { chatProjectAgent } from "./agents/chat-project";
import { chatRoleplayAgent } from "./agents/chat-roleplay";
import { longBookAnalysisAgent } from "./agents/long-book-analysis";
import { revisionAnalysisAgent } from "./agents/revision-analysis";
import { shortBookAnalysisAgent } from "./agents/short-book-analysis";
import { styleComparisonAgent } from "./agents/style-comparison";
import {
  bindExtrasAgent,
  bindExtrasConversationAgent,
  type BoundExtrasAgent,
  type BoundExtrasTaskAgent,
  type ExtrasAgentRunServices
} from "./definition";

export interface ExtrasAgentRunInput {
  runId: string;
  spec: ExtrasAgentRunSpec;
  signal?: AbortSignal;
  longCommandExecutor?: LongCommandExecutor;
}

/** The extras agent registry: every agent id maps to exactly one definition. */
export function resolveExtrasAgent(
  task: ExtrasAgentResolvedTask
): BoundExtrasAgent {
  switch (task.agentId) {
    case "revision-analysis":
      return bindExtrasAgent(revisionAnalysisAgent, task);
    case "short-book-analysis":
      return bindExtrasAgent(shortBookAnalysisAgent, task);
    case "long-book-analysis":
      return bindExtrasAgent(longBookAnalysisAgent, task);
    case "style-comparison":
      return bindExtrasAgent(styleComparisonAgent, task);
    case "chat-normal":
      return bindExtrasConversationAgent(chatNormalAgent, task);
    case "chat-project":
      return bindExtrasConversationAgent(chatProjectAgent, task);
    case "chat-roleplay":
      return bindExtrasConversationAgent(chatRoleplayAgent, task);
  }
}

type CompletedEvent = Extract<AgentRuntimeEvent, { type: "agent.completed" }>;

function finalOutputEvents(
  agent: BoundExtrasTaskAgent,
  completed: CompletedEvent
): AgentRuntimeEvent[] {
  const { runId, sessionId, payload } = completed;
  if (!agent.finalOutput || payload.stopReason === "aborted") return [];
  const failure = (code: string, message: string): AgentRuntimeEvent => ({
    type: "agent.error",
    runId,
    sessionId,
    payload: { code, message, runtime: payload.runtime }
  });
  if (payload.stopReason === "length") {
    return [
      failure(
        "extras_agent.output_truncated",
        agent.truncatedOutputMessage ?? "模型输出达到长度上限，结果不完整。"
      )
    ];
  }
  try {
    return [
      {
        type: "extras_agent.output_updated",
        runId,
        sessionId,
        payload: {
          agentId: agent.agentId,
          jobId: agent.jobId,
          output: agent.finalOutput(payload.content),
          runtime: payload.runtime
        }
      }
    ];
  } catch (error: unknown) {
    return [
      failure(
        "extras_agent.invalid_output",
        error instanceof Error ? error.message : "模型未返回有效结果。"
      )
    ];
  }
}

/**
 * Plans a "更多功能" run; see `ExtrasTaskAgentDefinition` for one-shot tasks
 * and `ExtrasConversationAgentDefinition` for chats.
 */
export function planExtrasRun(input: ExtrasAgentRunInput): AgentRunPlan {
  const { runId, spec, signal } = input;
  const agent = resolveExtrasAgent(spec.task);
  const identity = { runId, sessionId: spec.sessionId };
  const services: ExtrasAgentRunServices = {
    ...identity,
    ...(input.longCommandExecutor
      ? { longCommandExecutor: input.longCommandExecutor }
      : {})
  };
  const target: AgentRunTarget = {
    ...identity,
    ...(signal ? { signal } : {}),
    ...(spec.runtimeConfig ? { runtimeConfig: spec.runtimeConfig } : {}),
    ...(spec.thinkingLevel ? { thinkingLevel: spec.thinkingLevel } : {}),
    ...(spec.temperature !== undefined ? { temperature: spec.temperature } : {})
  };
  const shared = {
    eventSource: identity,
    portableToolSchemaProfile: "default" as const,
    assertModelBudget: (model: Parameters<typeof assertExtrasAgentBudget>[1]) =>
      assertExtrasAgentBudget(spec.task, model),
    build: () => ({
      systemPrompt: agent.systemPrompt,
      tools: agent.tools(services)
    })
  };
  if (agent.interaction === "task") {
    return {
      ...shared,
      target,
      fauxResponses: () => agent.faux(runId),
      userMessageContent: () => agent.userMessage,
      ...(agent.finalOutput
        ? { completionEvents: (event) => finalOutputEvents(agent, event) }
        : {})
    };
  }
  const turn = spec.conversation;
  if (!turn)
    throw new Error("Conversation agents require the conversation turn.");
  // One-shot analyses are budgeted up front and never compacted: dropping
  // source text would silently weaken their evidence. Chats are compacted.
  const contextPolicy: ContextPolicy | undefined =
    spec.contextCompactionSettings && {
      settings: spec.contextCompactionSettings,
      task: spec.task.agentId === "chat-roleplay" ? "roleplay" : "chat",
      toolCompactors: {},
      ...(turn.checkpoint ? { checkpoint: turn.checkpoint } : {}),
      ...(turn.compaction ? { manual: turn.compaction } : {})
    };
  return {
    ...shared,
    target: {
      ...target,
      ...(turn.history?.length ? { conversationHistory: turn.history } : {}),
      ...(turn.historyMode
        ? { conversationHistoryMode: turn.historyMode }
        : {}),
      ...(turn.attachments?.length ? { attachments: turn.attachments } : {}),
      ...(agent.webSearchEnabled ? { webSearchEnabled: true } : {}),
      ...(spec.compactionRuntimeConfig
        ? { compactionRuntimeConfig: spec.compactionRuntimeConfig }
        : {})
    },
    ...(contextPolicy ? { contextPolicy } : {}),
    agentKey: `${spec.sessionId}:extras:${agent.conversationKey}`,
    fauxResponses: (thinkingLevel) =>
      agent.faux({ message: turn.message, thinking: thinkingLevel !== "off" }),
    userMessageContent: () =>
      rawUserMessageContent({
        prompt: turn.message,
        ...(turn.attachments ? { attachments: turn.attachments } : {})
      })
  };
}
