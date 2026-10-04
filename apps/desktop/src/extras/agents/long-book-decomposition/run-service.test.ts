import { expect, it, vi } from "vitest";
import {
  CommandEnvelopeSchema,
  DEFAULT_DECOMPOSITION_PROFILE,
  createEnvelope,
  type AgentProviderRuntimeConfig,
  type CommandEnvelope,
  type CommandResult
} from "@deepwrite/contracts";
import {
  runExtrasAgent,
  type ExtrasAgentRunDependencies
} from "../run-service";

const runtimeConfig: AgentProviderRuntimeConfig = {
  id: "standard_model",
  label: "标准模型",
  provider: "test-provider",
  modelId: "standard",
  api: "openai-completions",
  baseUrl: "https://example.test/v1",
  apiKey: "invalid-placeholder",
  reasoning: false,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["low"],
  temperatureOptions: [0.1, 0.7, 1]
};

function fixture(contextWindow: number) {
  const now = new Date().toISOString();
  const requestAgent = vi.fn(
    async (command: CommandEnvelope): Promise<CommandResult> => {
      if (command.type === "agent.model_capacity")
        return {
          status: "accepted",
          requestId: command.id,
          payload: { modelId: runtimeConfig.id, contextWindow, maxTokens: 8192 }
        };
      if (command.type !== "agent.extras_run")
        throw new Error("不应派发其他命令");
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          sessionId: "capacity_session",
          runId: "capacity_run",
          acceptedAt: now,
          runtime: {
            provider: "test-provider",
            model: "standard",
            mode: "provider"
          }
        }
      };
    }
  );
  const cancelDecomposition = vi.fn(async () => undefined);
  const deps: ExtrasAgentRunDependencies = {
    configStore: () => {
      throw new Error("方案应来自 Core 快照");
    },
    resolveDecomposition: async () => ({
      task: {
        agentId: "long-book-decomposition",
        profile: DEFAULT_DECOMPOSITION_PROFILE,
        input: {
          jobId: "ldjob_capacity",
          phase: "read",
          unitIds: ["chunk:1"],
          outputVersion: 1,
          attemptId: "ldattempt_capacity",
          mode: "materials",
          modelId: runtimeConfig.id,
          thinkingLevel: "off",
          inputBudget: 70_000,
          contextWindow: 128_000,
          units: {
            "chunk:1": {
              phase: "read",
              status: "running",
              attempts: 0,
              inputRevision: "a".repeat(64),
              dependencies: [],
              outputRefs: [],
              receiptIds: [],
              updatedAt: now
            }
          }
        }
      },
      decompositionJobId: "ldjob_capacity",
      decompositionOutputVersion: 1,
      decompositionAttemptId: "ldattempt_capacity",
      decompositionUnitIds: ["chunk:1"],
      decompositionPhase: "read"
    }),
    cancelDecomposition,
    chatSources: {
      core: async () => {
        throw new Error("不应读取聊天上下文");
      },
      listModels: async () => ({}),
      queryUsage: async () => ({}),
      appVersion: () => "1.0.0"
    },
    acquireConversation: () => () => undefined,
    resolveModel: async () => runtimeConfig,
    resolveContextCompaction: async () => ({
      contextCompactionSettings: { enabled: false, budgetTokens: 16_000 }
    }),
    requestAgent,
    activeRuns: new Map(),
    terminalRuns: new Set(),
    pendingUsageContexts: new Map()
  };
  const command = CommandEnvelopeSchema.parse(
    createEnvelope(
      "extrasAgent.run",
      {
        sessionId: "capacity_session",
        modelId: runtimeConfig.id,
        task: {
          agentId: "long-book-decomposition",
          profileId: DEFAULT_DECOMPOSITION_PROFILE.id,
          input: {
            jobId: "ldjob_capacity",
            phase: "read",
            unitIds: ["chunk:1"]
          }
        }
      },
      {
        id: "capacity_command",
        context: {
          correlationId: "capacity_correlation",
          sessionId: "capacity_session"
        }
      }
    )
  );
  if (command.type !== "extrasAgent.run") throw new Error("错误命令");
  return { deps, command, requestAgent, cancelDecomposition };
}

it("Main 使用 Agent 的有效容量校验标准模型，容量查询不携带凭据，运行强制启用压缩", async () => {
  const f = fixture(128_000);
  expect(await runExtrasAgent(f.deps, f.command)).toMatchObject({
    status: "accepted"
  });
  const commands = f.requestAgent.mock.calls.map(([command]) => command);
  expect(commands.map(({ type }) => type)).toEqual([
    "agent.model_capacity",
    "agent.extras_run"
  ]);
  expect(commands[0]).toMatchObject({
    payload: { runtimeConfig: { apiKey: "" } }
  });
  expect(commands[1]).toMatchObject({
    payload: { contextCompactionSettings: { enabled: true } }
  });
  expect(f.cancelDecomposition).not.toHaveBeenCalled();
  expect([...f.deps.activeRuns.values()][0]).toMatchObject({
    decompositionJobId: "ldjob_capacity"
  });
});

it("运行时窗口缩小后拒绝工作包并撤销已打开尝试，不调用真实运行", async () => {
  const f = fixture(8000);
  expect(await runExtrasAgent(f.deps, f.command)).toMatchObject({
    status: "rejected",
    error: { message: expect.stringContaining("16,000") }
  });
  expect(f.requestAgent.mock.calls.map(([command]) => command.type)).toEqual([
    "agent.model_capacity"
  ]);
  expect(f.cancelDecomposition).toHaveBeenCalledTimes(1);
  expect(f.deps.activeRuns.size).toBe(0);
});
