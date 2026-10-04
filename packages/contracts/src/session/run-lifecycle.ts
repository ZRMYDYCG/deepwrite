import { z } from "zod";
import { EnvelopeBaseSchema, type Envelope } from "../envelope";
import { validateAgentEventContext } from "./envelopes";

/** Internal Utility-to-Main notification, after the execution iterator drains. */
export const AgentRunDrainedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  promptRequestId: z.string().min(1)
});
export type AgentRunDrainedPayload = z.infer<
  typeof AgentRunDrainedPayloadSchema
>;

export const AgentRunDrainedEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.run_drained"),
  payload: AgentRunDrainedPayloadSchema
}).superRefine(validateAgentEventContext);

export type AgentRunDrainedEventEnvelope = Envelope<
  AgentRunDrainedPayload,
  "agent.run_drained"
>;
