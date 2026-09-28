import { expect, it } from "vitest";
import { AgentRunRegistry } from "./agent-run-registry";
import type { AgentRuntimeEvent } from "@deepwrite/pi-runtime-adapter";

it("starts restoration after the acceptance can be posted to Main", async () => {
  const runs = new AgentRunRegistry();
  const { runId } = runs.begin("session", false);
  let accepted = false;
  let started = false;
  let observedAcceptance = false;
  async function* source(): AsyncIterable<AgentRuntimeEvent> {
    started = true;
    observedAcceptance = accepted;
    yield {
      type: "agent.error",
      runId,
      sessionId: "session",
      payload: {
        code: "test.complete",
        message: "Fixture complete",
        runtime: { mode: "local-faux", provider: "example", model: "test" }
      }
    };
  }
  runs.stream(
    {
      runId,
      sessionId: "session",
      runtime: { mode: "local-faux", provider: "example", model: "test" }
    },
    source(),
    "request",
    () => {}
  );
  expect(started).toBe(false);
  accepted = true;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(started).toBe(true);
  expect(observedAcceptance).toBe(true);
  await runs.shutdown();
});
