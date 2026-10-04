import { expect, it } from "vitest";
import { createEnvelope } from "../envelope";
import { SystemEventEnvelopeSchema } from "../system";

it("validates the Utility drain identity on the existing event envelope", () => {
  const event = createEnvelope(
    "agent.run_drained",
    {
      sessionId: "session",
      runId: "run",
      promptRequestId: "prompt"
    },
    { id: "drained", context: { sessionId: "session", runId: "run" } }
  );
  expect(SystemEventEnvelopeSchema.parse(event)).toEqual(event);
  expect(
    SystemEventEnvelopeSchema.safeParse({
      ...event,
      context: { ...event.context, sessionId: "other" }
    }).success
  ).toBe(false);
  expect(
    SystemEventEnvelopeSchema.safeParse({
      ...event,
      context: { ...event.context, runId: "other" }
    }).success
  ).toBe(false);
  expect(
    SystemEventEnvelopeSchema.safeParse({
      ...event,
      payload: { ...event.payload, promptRequestId: "" }
    }).success
  ).toBe(false);
});
