import { expect, it, vi } from "vitest";
import {
  CommandEnvelopeSchema,
  createEnvelope,
  type CommandEnvelope,
  type CommandResult
} from "@deepwrite/contracts";
import type { IpcCommandContext } from "./command-types";
import { handleSessionCommands } from "./session-commands";
import {
  acquireConversationOperation,
  releaseConversationRuns
} from "./conversation-operation-guard";
import { releaseDrainedAgentRun } from "./agent-run-drain";
import { AgentRunDrainedEventEnvelopeSchema } from "@deepwrite/contracts";

const runtime = {
  mode: "local-faux" as const,
  provider: "example",
  model: "fixture"
};
function command(id: string): CommandEnvelope {
  return CommandEnvelopeSchema.parse(
    createEnvelope(
      "session.prompt",
      { sessionId: "session", message: "Continue" },
      {
        id,
        context: { sessionId: "session", correlationId: id }
      }
    )
  );
}
function fixture() {
  const requestCommand = vi.fn(
    async (
      _worker: string,
      command: CommandEnvelope
    ): Promise<CommandResult> => ({
      status: "accepted",
      requestId: command.id,
      payload: {
        sessionId: "session",
        runId: "run",
        runtime,
        acceptedAt: new Date().toISOString()
      }
    })
  );
  const resolve = vi.fn(async () => undefined);
  const ctx = {
    activeRuns: new Map(),
    terminalRuns: new Set(),
    pendingUsageContexts: new Map(),
    supervisor: { requestCommand },
    requireModelConfigStore: () => ({ resolve }),
    requireAgentTeamConfigStore: () => ({}),
    requireLibraryAgentConfigStore: () => ({}),
    requireGeneralSettingsStore: () => ({
      list: async () => ({
        settings: { contextCompaction: { enabled: false, budgetTokens: 16000 } }
      })
    })
  } as unknown as IpcCommandContext;
  const owner = () => requestCommand.mock.lastCall![1].id;
  const drain = (promptRequestId: string, correlationId = promptRequestId) =>
    releaseDrainedAgentRun(
      ctx.activeRuns,
      ctx.pendingUsageContexts,
      AgentRunDrainedEventEnvelopeSchema.parse(
        createEnvelope(
          "agent.run_drained",
          { sessionId: "session", runId: "run", promptRequestId },
          {
            id: `drained-${promptRequestId}`,
            context: {
              sessionId: "session",
              runId: "run",
              correlationId
            }
          }
        )
      ),
      (runId) => ctx.terminalRuns.add(runId)
    );
  return { ctx, requestCommand, resolve, drain, owner };
}

it("owns the session during model resolution, acceptance and execution drainage", async () => {
  const f = fixture();
  let resolved!: () => void;
  f.resolve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolved = () => resolve(undefined);
      })
  );
  const first = handleSessionCommands(f.ctx, command("first"));
  expect(await handleSessionCommands(f.ctx, command("second"))).toMatchObject({
    status: "rejected",
    error: { code: "agent.session_busy" }
  });
  expect(
    acquireConversationOperation(f.ctx.activeRuns, "session", "management")
  ).toBeUndefined();
  expect(f.requestCommand).not.toHaveBeenCalled();
  resolved();
  expect(await first).toMatchObject({ status: "accepted" });
  // A visible terminal and revoked Core authority still leave the lease held.
  f.ctx.activeRuns.get("run")!.accepted = false;
  f.ctx.terminalRuns.add("run");
  expect(await handleSessionCommands(f.ctx, command("third"))).toMatchObject({
    status: "rejected",
    error: { code: "agent.session_busy" }
  });
  f.drain("wrong-prompt");
  expect(f.ctx.activeRuns.has("run")).toBe(true);
  f.drain(f.owner());
  expect(f.ctx.activeRuns.size).toBe(0);
  expect(
    acquireConversationOperation(f.ctx.activeRuns, "session", "management")
  ).toBeTypeOf("function");
});

it("releases when preparation fails or Agent explicitly rejects the prompt", async () => {
  const f = fixture();
  f.resolve.mockRejectedValueOnce(new Error("Model fixture unavailable"));
  expect(
    await handleSessionCommands(f.ctx, command("prepare-failure"))
  ).toMatchObject({ status: "rejected" });
  f.requestCommand.mockImplementationOnce(async (_worker, internal) => ({
    status: "rejected",
    requestId: internal.id,
    error: { code: "fixture.rejected", message: "Rejected" }
  }));
  expect(await handleSessionCommands(f.ctx, command("rejected"))).toMatchObject(
    {
      status: "rejected",
      requestId: "rejected",
      error: { code: "fixture.rejected" }
    }
  );
  expect(await handleSessionCommands(f.ctx, command("retry"))).toMatchObject({
    status: "accepted"
  });
  f.drain(f.owner());
});

it("holds uncertain transport failures until drainage or Utility exit", async () => {
  const f = fixture();
  f.requestCommand.mockRejectedValueOnce(new Error("Acceptance timed out"));
  expect(await handleSessionCommands(f.ctx, command("unknown"))).toMatchObject({
    status: "rejected"
  });
  expect(await handleSessionCommands(f.ctx, command("retry"))).toMatchObject({
    status: "rejected",
    error: { code: "agent.session_busy" }
  });
  f.drain(f.owner());
  f.requestCommand.mockRejectedValueOnce(new Error("Acceptance timed out"));
  await handleSessionCommands(f.ctx, command("unknown-again"));
  releaseConversationRuns(f.ctx.activeRuns);
  expect(
    await handleSessionCommands(f.ctx, command("after-exit"))
  ).toMatchObject({ status: "accepted" });
  f.drain(f.owner());
});

it("does not release a running prompt merely because abort was accepted", async () => {
  const f = fixture();
  await handleSessionCommands(f.ctx, command("running"));
  const runningOwner = f.owner();
  const abort = CommandEnvelopeSchema.parse(
    createEnvelope(
      "session.abort",
      { sessionId: "session", runId: "run" },
      {
        id: "abort",
        context: { sessionId: "session", runId: "run" }
      }
    )
  );
  f.requestCommand.mockResolvedValueOnce({
    status: "accepted",
    requestId: "abort",
    payload: {
      sessionId: "session",
      runId: "run",
      abortedAt: new Date().toISOString()
    }
  });
  expect(await handleSessionCommands(f.ctx, abort)).toMatchObject({
    status: "accepted",
    requestId: "abort"
  });
  expect(
    await handleSessionCommands(f.ctx, command("after-abort"))
  ).toMatchObject({
    status: "rejected",
    error: { code: "agent.session_busy" }
  });
  f.drain(runningOwner);
});

it("does not resurrect a run that drained before its acceptance was delivered", async () => {
  const f = fixture();
  f.requestCommand.mockImplementationOnce(async (_worker, internal) => {
    f.drain(internal.id);
    return {
      status: "accepted",
      requestId: internal.id,
      payload: {
        sessionId: "session",
        runId: "run",
        runtime,
        acceptedAt: new Date().toISOString()
      }
    };
  });
  expect(await handleSessionCommands(f.ctx, command("fast-run"))).toMatchObject(
    { status: "accepted" }
  );
  expect(f.ctx.activeRuns.size).toBe(0);
  expect(await handleSessionCommands(f.ctx, command("next"))).toMatchObject({
    status: "accepted"
  });
  f.drain(f.owner());
});

it("gives reused Renderer request ids distinct owners and ignores old drainage for pending usage", async () => {
  const f = fixture();
  expect(await handleSessionCommands(f.ctx, command("reused"))).toMatchObject({
    status: "accepted",
    requestId: "reused"
  });
  const oldOwner = f.owner();
  f.drain(oldOwner, "reused");
  let rejectSecond!: () => void;
  f.requestCommand.mockImplementationOnce(
    (_worker, internal) =>
      new Promise((resolve) => {
        rejectSecond = () =>
          resolve({
            status: "rejected",
            requestId: internal.id,
            error: { code: "fixture.rejected", message: "Rejected" }
          });
      })
  );
  const pending = handleSessionCommands(f.ctx, command("reused"));
  await vi.waitFor(() => expect(f.requestCommand).toHaveBeenCalledTimes(2));
  expect(f.owner()).not.toBe(oldOwner);
  expect(f.owner()).not.toBe("reused");
  expect(f.ctx.pendingUsageContexts.has("reused")).toBe(true);
  f.drain(oldOwner, "reused");
  expect(f.ctx.pendingUsageContexts.has("reused")).toBe(true);
  expect(await handleSessionCommands(f.ctx, command("reused"))).toMatchObject({
    status: "rejected",
    error: { code: "agent.session_busy" }
  });
  rejectSecond();
  expect(await pending).toMatchObject({
    status: "rejected",
    requestId: "reused"
  });
});
