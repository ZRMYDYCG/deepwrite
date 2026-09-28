import { describe, expect, it } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import {
  createAssistantMessageEventStream,
  type AssistantMessage
} from "@earendil-works/pi-ai";
import {
  DEFAULT_LIBRARY_AGENT_PROFILES,
  DEFAULT_LONG_AGENT_PROFILES,
  DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES,
  SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS,
  SCRIPT_WORKSPACE_TEXT_STAGE_IDS,
  SHORT_WORKSPACE_TEXT_STAGE_IDS,
  createDefaultCreativePlotStages,
  createShortWorkspaceContentRevision,
  type AgentProviderRuntimeConfig,
  type ChatAssistantRuntimeSnapshot,
  type LongWorkspaceRuntimeContext,
  type ScriptWorkspaceAgentProfile,
  type ScriptWorkspaceSnapshot,
  type ShortWorkspaceSnapshot
} from "@deepwrite/contracts";
import {
  buildEffectiveSystemPrompt,
  buildAgentEvaluationSnapshot,
  evaluationConversationHistory,
  buildProviderRuntime,
  buildRawUserMessage,
  buildRuntimeUserPrompt,
  interceptToolCallStream,
  resolveProviderModelCapacity,
  PiAgentRuntimeAdapter,
  reconcileToolCallArguments,
  toRuntimeEvents,
  toToolStreamRuntimeEvent,
  toUsageObservedRuntimeEvent,
  type AgentRuntimeEvent
} from "./index";

const providerRuntime = {
  provider: "deepseek",
  model: "deepseek-chat",
  mode: "provider" as const
};

function normalChatContext(): ChatAssistantRuntimeSnapshot {
  const generatedAt = "2026-08-17T08:00:00.000Z";
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    requestCount: 0
  };
  const dashboard = {
    generatedAt,
    totals,
    trendGranularity: "day" as const,
    trend: [],
    models: [],
    modules: [],
    recentCalls: []
  };
  return {
    software: {
      name: "DeepWrite",
      version: "1.2.3",
      platform: "darwin",
      arch: "arm64",
      currentTime: generatedAt,
      timezone: "Asia/Shanghai"
    },
    catalog: {
      schemaVersion: 1,
      revision: 0,
      creativePlotStages: createDefaultCreativePlotStages(),
      books: [],
      materials: [],
      materialGroups: [],
      skills: [],
      skillGroups: [],
      updatedAt: generatedAt
    },
    longBooks: [],
    models: [],
    defaultModelId: "",
    usage: {
      today: dashboard,
      "7d": dashboard,
      "30d": dashboard,
      all: dashboard
    }
  };
}

function scriptAgentProfile(): ScriptWorkspaceAgentProfile {
  const profile = DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES[0]!;
  return {
    ...profile,
    systemPrompt: "用户在设置中编辑的剧本正文专家提示词。"
  };
}

function screenplayWorkspace(): ScriptWorkspaceSnapshot {
  const emptyRevision = createShortWorkspaceContentRevision("");
  return {
    id: "script-runtime-test",
    title: "雾港剧本",
    categories: ["悬疑"],
    activeStageId: "draft",
    activeAgentId: "script",
    activeSectionId: "episode-1",
    characterStructure: { format: "text" },
    plotStages: createDefaultCreativePlotStages(),
    expertDraft: {
      id: "draft",
      title: "正文",
      revision: createShortWorkspaceContentRevision("episode-1"),
      sections: [
        {
          id: "episode-1",
          title: "第一集",
          wordCountRequirement: "15 分钟",
          body: {
            documentId: "draft:episode-1:body",
            title: "第一集",
            content: "",
            revision: emptyRevision
          },
          characterState: {
            documentId: "draft:episode-1:state",
            title: "第一集 · 人物状态",
            content: "",
            revision: emptyRevision
          }
        }
      ]
    },
    stages: SCRIPT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => ({
      stageId,
      title: stageId,
      content: "",
      revision: emptyRevision
    }))
  };
}

function toolCallMessage(id: string, name: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: {} }],
    api: "openai-completions",
    provider: "deepseek",
    model: "deepseek-chat",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: "toolUse",
    timestamp: Date.now()
  };
}

async function captureDisabledThinkingPayload(
  config: AgentProviderRuntimeConfig
): Promise<Record<string, unknown>> {
  const { model, streamFn } = buildProviderRuntime(
    config,
    config.temperatureOptions[1],
    "off"
  );
  let capturedPayload: unknown;
  const stream = await streamFn(
    model,
    {
      systemPrompt: "Reply with OK only.",
      messages: [
        {
          role: "user",
          content: "OK",
          timestamp: Date.now()
        }
      ]
    },
    {
      onPayload: (payload) => {
        capturedPayload = payload;
        throw new Error("payload captured");
      }
    }
  );
  await stream.result();
  expect(capturedPayload).toBeDefined();
  return capturedPayload as Record<string, unknown>;
}

async function captureThinkingPayload(
  config: AgentProviderRuntimeConfig,
  configuredLevel: "low" | "high" | "max"
): Promise<Record<string, unknown>> {
  const { model, streamFn } = buildProviderRuntime(
    config,
    undefined,
    configuredLevel
  );
  let capturedPayload: unknown;
  const stream = await streamFn(
    model,
    {
      systemPrompt: "Reply with OK only.",
      messages: [
        {
          role: "user",
          content: "OK",
          timestamp: Date.now()
        }
      ]
    },
    {
      reasoning: configuredLevel === "max" ? "xhigh" : configuredLevel,
      onPayload: (payload) => {
        capturedPayload = payload;
        throw new Error("payload captured");
      }
    }
  );
  await stream.result();
  expect(capturedPayload).toBeDefined();
  return capturedPayload as Record<string, unknown>;
}

function ollamaGrammarRegressionTool(): AgentTool {
  const parameters = Type.Object({
    direct_text: Type.String({ maxLength: 200_000 }),
    replacements: Type.Array(
      Type.Object({
        original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
        new_text: Type.String({ maxLength: 20_000 })
      })
    )
  });
  return {
    name: "edit_text",
    label: "Edit text",
    description: "Edit text with exact replacements.",
    parameters,
    execute: async () => ({
      content: [{ type: "text", text: "ok" }],
      details: {}
    })
  };
}

function toolWithParameters(
  name: string,
  parameters: AgentTool["parameters"]
): AgentTool {
  return {
    name,
    label: name,
    description: "Provider schema compatibility regression tool.",
    parameters,
    execute: async () => ({
      content: [{ type: "text", text: "ok" }],
      details: {}
    })
  };
}

async function captureToolPayload(
  config: AgentProviderRuntimeConfig,
  tool: AgentTool
): Promise<Record<string, unknown>> {
  const { model, streamFn } = buildProviderRuntime(config, 0.7, "off");
  let capturedPayload: unknown;
  const stream = await streamFn(
    model,
    {
      systemPrompt: "Use the available tool.",
      messages: [
        { role: "user", content: "Edit the text.", timestamp: Date.now() }
      ],
      tools: [tool]
    },
    {
      onPayload: (payload) => {
        capturedPayload = payload;
        throw new Error("payload captured");
      }
    }
  );
  await stream.result();
  expect(capturedPayload).toBeDefined();
  return capturedPayload as Record<string, unknown>;
}

export {
  DEFAULT_LIBRARY_AGENT_PROFILES,
  DEFAULT_LONG_AGENT_PROFILES,
  DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES,
  PiAgentRuntimeAdapter,
  SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS,
  SCRIPT_WORKSPACE_TEXT_STAGE_IDS,
  SHORT_WORKSPACE_TEXT_STAGE_IDS,
  Type,
  buildAgentEvaluationSnapshot,
  buildEffectiveSystemPrompt,
  buildProviderRuntime,
  buildRawUserMessage,
  buildRuntimeUserPrompt,
  resolveProviderModelCapacity,
  captureDisabledThinkingPayload,
  captureThinkingPayload,
  captureToolPayload,
  createAssistantMessageEventStream,
  createDefaultCreativePlotStages,
  createShortWorkspaceContentRevision,
  describe,
  evaluationConversationHistory,
  expect,
  interceptToolCallStream,
  it,
  normalChatContext,
  ollamaGrammarRegressionTool,
  providerRuntime,
  reconcileToolCallArguments,
  screenplayWorkspace,
  scriptAgentProfile,
  toRuntimeEvents,
  toToolStreamRuntimeEvent,
  toUsageObservedRuntimeEvent,
  toolCallMessage,
  toolWithParameters
};
export type {
  AgentProviderRuntimeConfig,
  AgentRuntimeEvent,
  AgentTool,
  AssistantMessage,
  ChatAssistantRuntimeSnapshot,
  LongWorkspaceRuntimeContext,
  ScriptWorkspaceAgentProfile,
  ScriptWorkspaceSnapshot,
  ShortWorkspaceSnapshot
};
