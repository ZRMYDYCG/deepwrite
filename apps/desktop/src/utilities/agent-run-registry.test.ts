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
      promptRequestId: "command",
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

it("keeps the session after a terminal event until the execution iterator drains", async () => {
  const runs = new AgentRunRegistry();
  const { runId } = runs.begin("session", false);
  const runtime = {
    mode: "local-faux" as const,
    provider: "example",
    model: "test"
  };
  let releaseTool!: () => void;
  const tool = new Promise<void>((resolve) => {
    releaseTool = resolve;
  });
  const events: string[] = [];
  async function* source(): AsyncIterable<AgentRuntimeEvent> {
    yield {
      type: "agent.error",
      runId,
      sessionId: "session",
      payload: { code: "pi_agent.aborted", message: "中止", runtime }
    };
    await tool;
  }
  runs.stream(
    { runId, sessionId: "session", runtime, promptRequestId: "command" },
    source(),
    "correlation",
    (event) => events.push(event.type)
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(events).toEqual(["agent.error"]);
  expect(runs.admissionError("session", false)?.code).toBe(
    "agent.session_busy"
  );
  releaseTool();
  await runs.shutdown();
  expect(events).toEqual(["agent.error", "agent.run_drained"]);
  expect(runs.admissionError("session", false)).toBeUndefined();
});
