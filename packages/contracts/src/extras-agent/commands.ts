import { z } from "zod";
import { EnvelopeBaseSchema } from "../envelope";
import { ExtrasAgentIdSchema } from "./ids";
import {
  ExtrasAgentSettingsInputSchema,
  ExtrasAgentSettingsResetInputSchema
} from "./profiles";
import { ExtrasAgentRunRequestSchema, ExtrasAgentRunSpecSchema } from "./tasks";

function matchesPayloadSession(
  value: {
    context: { sessionId?: string | undefined };
    payload: { sessionId: string };
  },
  context: z.core.$RefinementCtx<unknown>
): void {
  if (value.context.sessionId !== value.payload.sessionId) {
    context.addIssue({
      code: "custom",
      path: ["context", "sessionId"],
      message: "Envelope sessionId must match the extras agent run."
    });
  }
}

export const ExtrasAgentRunCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("extrasAgent.run"),
  payload: ExtrasAgentRunRequestSchema
}).superRefine(matchesPayloadSession);

/** Main -> Agent Utility only; Renderer requests are rejected by Main. */
export const AgentExtrasRunCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.extras_run"),
  payload: ExtrasAgentRunSpecSchema
}).superRefine(matchesPayloadSession);

export const ExtrasAgentCommandSchemas = [
  ExtrasAgentRunCommandEnvelopeSchema,
  AgentExtrasRunCommandEnvelopeSchema,
  EnvelopeBaseSchema.extend({
    type: z.literal("extrasAgentConfig.list"),
    payload: z.object({ agentId: ExtrasAgentIdSchema })
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("extrasAgentConfig.save"),
    payload: ExtrasAgentSettingsInputSchema
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("extrasAgentConfig.reset"),
    payload: ExtrasAgentSettingsResetInputSchema
  })
] as const;
