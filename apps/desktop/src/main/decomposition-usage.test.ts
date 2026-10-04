import { describe, expect, it } from "vitest";
import type { SystemEventEnvelope } from "@deepwrite/contracts";
import {
  restoreDecompositionUsage,
  takeDecompositionUsage
} from "./decomposition-usage";
import { recordUsageObservation } from "./usage-observation";

function observed(
  runId: string,
  mode: "provider" | "local-faux" = "provider",
  subagentRunId?: string
) {
  return {
    type: "agent.usage_observed",
    payload: {
      runId,
      ...(subagentRunId ? { subagentRunId } : {}),
      runtime: { mode, provider: "example", model: "model" },
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 900,
        cacheWriteTokens: 50,
        totalTokens: 1070
      }
    },
    context: { correlationId: "correlation" }
  } as unknown as Extract<
    SystemEventEnvelope,
    { type: "agent.usage_observed" }
  >;
}

describe("decomposition usage in Main", () => {
  it("counts parent and child requests of a task's runs until handed to Core", () => {
    const runs = new Map([["run_job", { decompositionJobId: "ldjob_usage" }]]);
    recordUsageObservation(observed("run_job"), undefined, runs, new Map());
    recordUsageObservation(
      observed("run_job", "provider", "subrun_child"),
      undefined,
      runs,
      new Map()
    );
    recordUsageObservation(
      observed("run_job", "local-faux"),
      undefined,
      runs,
      new Map()
    );
    recordUsageObservation(observed("run_other"), undefined, runs, new Map());
    const usage = takeDecompositionUsage("ldjob_usage");
    expect(usage).toEqual({
      inputTokens: 300,
      cacheReadTokens: 1800,
      outputTokens: 40,
      requests: 2
    });
    expect(takeDecompositionUsage("ldjob_usage")).toBeUndefined();
    restoreDecompositionUsage("ldjob_usage", usage!);
    expect(takeDecompositionUsage("ldjob_usage")).toEqual(usage);
  });
});
