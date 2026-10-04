import { describe, expect, it, vi } from "vitest";
import {
  CommandEnvelopeSchema,
  createEnvelope,
  type CommandEnvelope,
  type CommandResult
} from "@deepwrite/contracts";
import { handleBookIdentitySubmission } from "./submit-bridge";
import {
  authorizeMainInternalCommand,
  type MainInternalCommandActiveRun
} from "../../main/internal-command-authorizer";
import type { UtilityInternalCommandAuthorizationContext } from "../../main/supervisor";

function fixture() {
  const book = { projectType: "short" as const, projectId: "book_test" };
  const run: MainInternalCommandActiveRun = {
    accepted: true,
    sessionId: "session_test",
    promptRequestId: "prompt_test",
    bookIdentity: {
      book,
      field: "title",
      roundId: "round_test",
      candidateCount: 2,
      profile: { id: "default", name: "通用" },
      request: { candidateCount: 2, seedCandidateIds: [] }
    }
  };
  const runs = new Map([["run_test", run]]);
  const command = CommandEnvelopeSchema.parse(
    createEnvelope(
      "bookIdentity.submitRound",
      {
        book,
        roundId: "round_test",
        field: "title",
        candidates: [
          {
            title: "长夜将明",
            angle: "悬念",
            rationale: "依据作品",
            keywords: ["希望"]
          },
          {
            title: "旧城新雨",
            angle: "意象",
            rationale: "依据处境",
            keywords: ["城市"]
          }
        ]
      },
      {
        id: "cmd_test",
        context: {
          runId: "run_test",
          sessionId: "session_test",
          resourceId: "short:book_test"
        }
      }
    )
  );
  const context: UtilityInternalCommandAuthorizationContext = {
    source: "agent",
    target: "core",
    message: {
      kind: "utility.internal.command.request",
      worker: "agent",
      target: "core",
      requestId: "bridge_test",
      parentRequestId: "prompt_test",
      timeoutMs: 120000,
      command
    }
  };
  const core = vi.fn<(command: CommandEnvelope) => Promise<CommandResult>>(
    async (command) => ({
      status: "accepted",
      requestId: command.id,
      payload: { roundId: "round_test", revision: 1 }
    })
  );
  return { run, runs, context, core };
}
describe("book identity submission bridge", () => {
  it("persists Main's allocated round, then acknowledges it once", async () => {
    const f = fixture();
    expect(
      await handleBookIdentitySubmission(f.context, f.runs, f.core)
    ).toMatchObject({
      status: "accepted",
      requestId: "cmd_test",
      payload: { roundId: "round_test", revision: 1 }
    });
    expect(f.core).toHaveBeenCalledTimes(1);
    const appended = f.core.mock.calls[0]![0];
    expect(appended.type).toBe("bookIdentity.appendRound");
    if (appended.type !== "bookIdentity.appendRound")
      throw new Error("wrong command");
    expect(appended.payload.round).toMatchObject({
      id: "round_test",
      field: "title",
      source: "agent",
      profile: { id: "default", name: "通用" }
    });
    expect(appended.payload.round.candidates).toHaveLength(2);
    expect(appended.payload.round.candidates[0]?.id).toMatch(/^cand_/);
    expect(
      await handleBookIdentitySubmission(f.context, f.runs, f.core)
    ).toMatchObject({ status: "rejected" });
    expect(f.core).toHaveBeenCalledTimes(1);
  });
  it.each([
    "accepted",
    "field",
    "round",
    "book",
    "count",
    "parent",
    "session",
    "route"
  ])("rejects a mismatched %s before writing", async (mismatch) => {
    const f = fixture();
    const command = f.context.message.command;
    if (command.type !== "bookIdentity.submitRound")
      throw new Error("wrong command");
    if (mismatch === "accepted") f.run.accepted = false;
    if (mismatch === "field") command.payload.field = "synopsis";
    if (mismatch === "round") command.payload.roundId = "round_other";
    if (mismatch === "book") command.payload.book.projectId = "book_other";
    if (mismatch === "count") command.payload.candidates.pop();
    if (mismatch === "parent")
      f.context.message.parentRequestId = "prompt_other";
    if (mismatch === "session") command.context.sessionId = "session_other";
    if (mismatch === "route") f.context.source = "tool";
    expect(authorizeMainInternalCommand(f.context, f.runs)).not.toBe(true);
    expect(
      await handleBookIdentitySubmission(f.context, f.runs, f.core)
    ).toMatchObject({ status: "rejected" });
    expect(f.core).not.toHaveBeenCalled();
  });
  it("does not expose successful output when Core rejects, and permits a retry", async () => {
    const f = fixture();
    f.core.mockResolvedValueOnce({
      status: "rejected",
      requestId: "cmd_test-append",
      error: { code: "test.failed", message: "测试保存失败" }
    });
    expect(
      await handleBookIdentitySubmission(f.context, f.runs, f.core)
    ).toMatchObject({ status: "rejected", error: { message: "测试保存失败" } });
    expect(f.run.bookIdentity?.submitted).toBeUndefined();
    expect(
      await handleBookIdentitySubmission(f.context, f.runs, f.core)
    ).toMatchObject({ status: "accepted" });
  });
  it("rejects a simultaneous second submission without releasing the first claim", async () => {
    const f = fixture();
    let finish!: (result: CommandResult) => void;
    f.core.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = handleBookIdentitySubmission(f.context, f.runs, f.core);
    expect(f.run.bookIdentity?.submitting).toBe(true);
    expect(
      await handleBookIdentitySubmission(f.context, f.runs, f.core)
    ).toMatchObject({ status: "rejected" });
    expect(f.run.bookIdentity?.submitting).toBe(true);
    finish({
      status: "accepted",
      requestId: "cmd_test-append",
      payload: { roundId: "round_test", revision: 1 }
    });
    expect(await first).toMatchObject({ status: "accepted" });
    expect(f.run.bookIdentity?.submitting).toBe(false);
  });
});
