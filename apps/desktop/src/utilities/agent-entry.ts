import { createBookIdentityService } from "./agent-book-identity-service";
import {
  ModelCapacityResultSchema,
  ModelConnectionTestResultSchema,
  SessionAbortAcceptedPayloadSchema,
  SessionUserInputResponseAcceptedPayloadSchema,
  SessionPromptAcceptedPayloadSchema,
  type CommandResult,
  type ExtrasAgentRunSpec
} from "@deepwrite/contracts";
import {
  PiAgentRuntimeAdapter,
  UserInputResolutionError
} from "@deepwrite/pi-runtime-adapter";
import { nowIso } from "@deepwrite/shared";
import {
  createAgentRunInput,
  createCoreCommandExecutor
} from "./agent-run-input";
import { AgentRunRegistry } from "./agent-run-registry";
import { createDecompositionServices } from "./agent-decomposition-services";
import { bootUtility } from "./runtime";

/** A long project chat reads the book through the Core query bridge. */
function readsLongProject({ task }: ExtrasAgentRunSpec): boolean {
  return (
    (task.agentId === "chat-project" &&
      task.input.project.projectType === "long") ||
    ((task.agentId === "book-title-design" ||
      task.agentId === "book-synopsis-design" ||
      task.agentId === "book-cover-design") &&
      task.input.book.projectType === "long")
  );
}

const runtime = new PiAgentRuntimeAdapter({
  evaluationMode: process.env.DEEPWRITE_APP_MODE === "evaluation"
});
const runs = new AgentRunRegistry();

bootUtility("agent", {
  mode: "pi-agent-provider",
  async commandHandler(command, emitEvent, context): Promise<CommandResult> {
    if (command.type === "agent.model_test") {
      const result = ModelConnectionTestResultSchema.parse(
        await runtime.testConnection(command.payload.runtimeConfig)
      );
      return {
        status: "accepted",
        requestId: command.id,
        payload: result
      };
    }

    if (command.type === "agent.model_capacity") {
      return {
        status: "accepted",
        requestId: command.id,
        payload: ModelCapacityResultSchema.parse(
          runtime.resolveModelCapacity(command.payload.runtimeConfig)
        )
      };
    }

    if (command.type === "agent.abort") {
      if (!runs.abort(command.payload.sessionId, command.payload.runId)) {
        return {
          status: "rejected",
          requestId: command.id,
          error: {
            code: "agent.run_not_active",
            message: "要停止的智能体运行已结束或不存在。"
          }
        };
      }
      return {
        status: "accepted",
        requestId: command.id,
        payload: SessionAbortAcceptedPayloadSchema.parse({
          sessionId: command.payload.sessionId,
          runId: command.payload.runId,
          abortedAt: nowIso()
        })
      };
    }

    if (command.type === "agent.user_input_response") {
      if (runs.activeRun(command.payload.sessionId) !== command.payload.runId) {
        return {
          status: "rejected",
          requestId: command.id,
          error: {
            code: "agent.run_not_active",
            message: "要回答的智能体运行已结束或不存在。"
          }
        };
      }
      try {
        return {
          status: "accepted",
          requestId: command.id,
          payload: SessionUserInputResponseAcceptedPayloadSchema.parse(
            runtime.resolveUserInput(command.payload)
          )
        };
      } catch (error: unknown) {
        return {
          status: "rejected",
          requestId: command.id,
          error: {
            code:
              error instanceof UserInputResolutionError
                ? error.code
                : "agent.user_input_response_failed",
            message:
              error instanceof Error ? error.message : "提交用户回答失败。"
          }
        };
      }
    }

    if (
      command.type !== "agent.prompt" &&
      command.type !== "agent.extras_run"
    ) {
      return {
        status: "rejected",
        requestId: command.id,
        error: {
          code: "agent.unsupported_command",
          message: `Agent utility does not support ${command.type}.`
        }
      };
    }

    const extras = command.type === "agent.extras_run";
    const rejection = runs.admissionError(command.payload.sessionId, extras);
    if (rejection) {
      return { status: "rejected", requestId: command.id, error: rejection };
    }

    const { runId, signal } = runs.begin(command.payload.sessionId, extras);
    const runtimeRef = runtime.describe(command.payload.runtimeConfig);
    const accepted = SessionPromptAcceptedPayloadSchema.parse({
      sessionId: command.payload.sessionId,
      runId,
      acceptedAt: nowIso(),
      runtime: runtimeRef
    });
    runs.stream(
      {
        runId,
        sessionId: command.payload.sessionId,
        runtime: runtimeRef,
        promptRequestId: command.id
      },
      command.type === "agent.extras_run"
        ? runtime.startExtras({
            runId,
            spec: command.payload,
            signal,
            ...([
              "book-title-design",
              "book-synopsis-design",
              "book-cover-design"
            ].includes(command.payload.task.agentId) && context
              ? createBookIdentityService(
                  context,
                  command.payload.sessionId,
                  runId
                )
              : {}),
            ...(command.payload.task.agentId === "long-book-decomposition" &&
            context
              ? createDecompositionServices(
                  context,
                  command.payload.sessionId,
                  runId
                )
              : {}),
            ...(readsLongProject(command.payload) && context
              ? { longCommandExecutor: createCoreCommandExecutor(context) }
              : {})
          })
        : runtime.start(
            createAgentRunInput(command.payload, runId, signal, context)
          ),
      command.context.correlationId,
      emitEvent
    );

    return {
      status: "accepted",
      requestId: command.id,
      payload: accepted
    };
  },
  onShutdown: () => runs.shutdown()
});
