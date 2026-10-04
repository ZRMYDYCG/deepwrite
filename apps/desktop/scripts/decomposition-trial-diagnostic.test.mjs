import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeDecompositionTrialFailure } from "./decomposition-trial-diagnostic.mjs";

test("provider request text and unknown diagnostic fields never reach output", () => {
  const sensitive =
    "https://example.test/request?token=invalid-test-placeholder";
  const output = [
    `DEEPWRITE_SMOKE_FAIL provider-http-404 ${sensitive}`,
    `DECOMP_TRIAL_DIAGNOSTIC ${JSON.stringify({
      step: "package-finish",
      phase: "read",
      status: "idle",
      done: 2,
      units: 4,
      tools: {
        submit_chapter_reading: { calls: 3, errors: 1, message: sensitive },
        [sensitive]: { calls: 1, errors: 1 }
      },
      childStatuses: { completed: 1, [sensitive]: 1 },
      unitStatuses: { done: 2, pending: 2 },
      failures: ["schema:card", sensitive],
      message: sensitive
    })}`
  ].join("\n");
  const result = summarizeDecompositionTrialFailure(output);
  assert.equal(result.smokeFailureMarker, true);
  assert.ok(result.failedChecks.includes("provider-http-404"));
  assert.deepEqual(result.diagnostic, {
    step: "package-finish",
    phase: "read",
    status: "idle",
    done: 2,
    units: 4,
    tools: { submit_chapter_reading: { calls: 3, errors: 1 } },
    childStatuses: { completed: 1 },
    unitStatuses: { pending: 2, done: 2 },
    failures: ["schema:card"]
  });
  assert.equal(JSON.stringify(result).includes(sensitive), false);
});

test("malformed or forged diagnostic stages cannot crash or leak", () => {
  for (const diagnostic of [
    "{",
    "null",
    "[]",
    '{"step":"https://example.test/unknown"}'
  ])
    assert.equal(
      summarizeDecompositionTrialFailure(
        `DECOMP_TRIAL_DIAGNOSTIC ${diagnostic}`
      ).diagnostic,
      null
    );
});

test("only bounded nonnegative integer counts and known states survive", () => {
  const result = summarizeDecompositionTrialFailure(
    `DECOMP_TRIAL_DIAGNOSTIC ${JSON.stringify({
      step: "package-wait",
      phase: "unknown",
      status: "unknown",
      done: -1,
      units: 1.5,
      targetEvents: 1_000_001,
      outputEvents: "invalid-test-placeholder",
      tools: { spawn_subagent: { calls: 2, errors: -1 } },
      childStatuses: { error: 2 },
      unitStatuses: { writing: 1, unknown: 4 }
    })}`
  );
  assert.deepEqual(result.diagnostic, {
    step: "package-wait",
    tools: { spawn_subagent: { calls: 2 } },
    childStatuses: { error: 2 },
    unitStatuses: { writing: 1 }
  });
});

test("the final diagnostic wins and unknown schema fields are discarded", () => {
  const result = summarizeDecompositionTrialFailure(
    [
      'DECOMP_TRIAL_DIAGNOSTIC {"step":"startup"}',
      "schema fields card,invalidPlaceholder,unitId",
      'DECOMP_TRIAL_DIAGNOSTIC {"step":"package-finish","done":4,"units":4}'
    ].join("\n")
  );
  assert.deepEqual(result.schemaFields, ["unitId", "card"]);
  assert.deepEqual(result.diagnostic, {
    step: "package-finish",
    done: 4,
    units: 4
  });
});
