import { expect, it } from "vitest";
import {
  CommandEnvelopeSchema,
  createEnvelope,
  type CommandEnvelope
} from "@deepwrite/contracts";
import {
  authorizeMainInternalCommand,
  type MainInternalCommandActiveRun
} from "./internal-command-authorizer";
import { isForbiddenRendererCommand } from "./ipc/forbidden-commands";
import type { UtilityInternalCommandAuthorizationContext } from "./supervisor";
const run: MainInternalCommandActiveRun = {
  sessionId: "session_decomp",
  promptRequestId: "prompt_decomp",
  accepted: true,
  decompositionJobId: "ldjob_1",
  decompositionOutputVersion: 1,
  decompositionAttemptId: "ldattempt_1",
  decompositionUnitIds: ["chunk:1", "reading:chapter_1"],
  decompositionPhase: "integrate"
};
function command(
  payload: Record<string, unknown> = {},
  context: Record<string, unknown> = {}
) {
  return CommandEnvelopeSchema.parse(
    createEnvelope(
      "longBookDecomposition.submitUnit",
      {
        jobId: "ldjob_1",
        outputVersion: 1,
        attemptId: "ldattempt_1",
        unitId: "chunk:1",
        inputRevision: "v1",
        data: { kind: "finish-card" },
        ...payload
      },
      {
        id: "submit_1",
        context: {
          runId: "run_decomp",
          sessionId: "session_decomp",
          resourceId: "ldjob_1",
          ...context
        }
      }
    )
  );
}
function authorize(
  cmd: CommandEnvelope,
  changes: Partial<MainInternalCommandActiveRun> = {},
  parentRequestId = "prompt_decomp"
) {
  const context: UtilityInternalCommandAuthorizationContext = {
    source: "agent",
    target: "core",
    message: {
      kind: "utility.internal.command.request",
      worker: "agent",
      target: "core",
      requestId: "bridge_decomp",
      parentRequestId,
      timeoutMs: 1000,
      command: cmd
    }
  };
  return authorizeMainInternalCommand(
    context,
    new Map([["run_decomp", { ...run, ...changes }]])
  );
}
it("真实工作包绑定才可提交；旧版本、旧尝试、跨任务及越包单元被拒", () => {
  expect(authorize(command())).toBe(true);
  for (const payload of [
    { jobId: "ldjob_other" },
    { outputVersion: 2 },
    { attemptId: "ldattempt_old" },
    { unitId: "character:outside" }
  ])
    expect(authorize(command(payload))).not.toBe(true);
  for (const context of [
    { runId: "run_unknown" },
    { sessionId: "session_other" },
    { resourceId: "ldjob_other" }
  ])
    expect(authorize(command({}, context))).not.toBe(true);
  expect(authorize(command(), { accepted: false })).not.toBe(true);
  expect(authorize(command(), {}, "different_parent")).not.toBe(true);
});
it("通用专题只能使用当前尝试的 1–5 号键，仍由 Core 复核实际登记", () => {
  expect(authorize(command({ unitId: "topic:ldattempt_1:1" }))).toBe(true);
  expect(authorize(command({ unitId: "topic:ldattempt_old:1" }))).not.toBe(
    true
  );
  expect(authorize(command({ unitId: "topic:ldattempt_1:6" }))).not.toBe(true);
  expect(
    authorize(command({ unitId: "topic:ldattempt_1:1" }), {
      decompositionPhase: "read"
    })
  ).not.toBe(true);
});
it("全部内部拆解与来源写入命令对 Renderer 禁止", () => {
  for (const type of [
    "longBookDecomposition.coreCreate",
    "longBookDecomposition.coreAccess",
    "longBookDecomposition.query",
    "longBookDecomposition.submitUnit",
    "longBookDecomposition.planTopic",
    "longBookAnalysis.coreSource"
  ])
    expect(isForbiddenRendererCommand(type)).toBe(true);
});
