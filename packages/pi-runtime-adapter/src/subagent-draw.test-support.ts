import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import {
  SessionUserInputResponsePayloadSchema,
  type AgentRuntimeRef,
  type SessionUserInputResponsePayload,
  type SubagentDrawSettings
} from "@deepwrite/contracts";
import { AgentRunKernel } from "./kernel/run-kernel";
import { ConversationAgentCache } from "./kernel/run-agent";
import { buildSpawnSubagentTool } from "./subagent-runtime";
import { AgentUserInputBroker } from "./user-input-broker";

/** Real draw execution with deterministic, credential-free model responses. */
export function createDrawRunFixture(input: {
  sessionId: string;
  runId: string;
  signal: AbortSignal;
  runtime: AgentRuntimeRef;
  selection: SubagentDrawSettings["selection"];
}) {
  const { sessionId, runId, signal, runtime, selection } = input;
  const broker = new AgentUserInputBroker();
  const kernel = new AgentRunKernel({
    agents: new ConversationAgentCache(new Map(), {}),
    userInputBroker: broker,
    idleTimeoutMs: 10_000,
    tokensPerSecond: 0,
    evaluationMode: false,
    retryPolicy: { delaysMs: [] },
    describe: () => runtime
  });
  let childSequence = 0;
  const events = kernel.run({
    target: { sessionId, runId, signal },
    eventSource: { sessionId, runId },
    portableToolSchemaProfile: "default",
    userMessageContent: () => "给第三章起标题",
    build(context) {
      const tool = buildSpawnSubagentTool({
        parentSessionId: sessionId,
        parentRuntime: context.runtime,
        parentSignal: context.parentSignal,
        model: context.model,
        streamFn: context.spawnStreamFn,
        thinkingLevel: context.thinkingLevel,
        requestUserInput: context.requestUserInput,
        createRunId: () => `draw-child-${++childSequence}`,
        buildChildTools: () => [],
        definitions: [
          {
            id: "titler",
            name: "标题助手",
            description: "起章节标题",
            systemPrompt: "只输出标题",
            enabled: true,
            agentMode: "pure-bare",
            modelMode: "inherit",
            draw: {
              enabled: true,
              count: 3,
              selection,
              evaluator: { modelMode: "inherit" }
            }
          }
        ]
      });
      if (!tool) throw new Error("Fixture spawn tool is unavailable.");
      return { systemPrompt: "委派标题任务", tools: [tool] };
    },
    fauxResponses: () => [
      fauxAssistantMessage(
        fauxToolCall("spawn_subagent", {
          tasks: [{ key: "title", subagent_id: "titler", task: "起标题" }]
        }),
        { stopReason: "toolUse" }
      ),
      ...["标题甲", "标题乙", "标题丙"].map((text) =>
        fauxAssistantMessage(text)
      ),
      ...(selection === "auto"
        ? [
            fauxAssistantMessage("尚未提交选择"),
            fauxAssistantMessage("仍未提交选择")
          ]
        : []),
      fauxAssistantMessage("已收到选中的标题，主任务完成。")
    ]
  });
  return {
    events,
    resolveUserInput(response: SessionUserInputResponsePayload) {
      return broker.resolve(
        SessionUserInputResponsePayloadSchema.parse(response)
      );
    }
  };
}
