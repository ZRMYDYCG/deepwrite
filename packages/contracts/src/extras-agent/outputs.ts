import { z } from "zod";
import { EnvelopeBaseSchema, type Envelope } from "../envelope";
import {
  LongBookAnalysisNoteWriteSchema,
  LongBookAnalysisResultSchema
} from "../long-book-analysis";
import { RevisionAnalysisResultSchema } from "../revision-analysis";
import { validateAgentEventContext } from "../session/envelopes";
import { AgentRuntimeRefSchema } from "../session/agent-event-identity";
import { StyleComparisonResultSchema } from "../style-comparison";
import { ExtrasAgentIdSchema } from "./ids";

const UnitIdSchema = z.string().trim().min(1).max(120);

/** A structured result an extras agent hands back for the user to review. */
export const ExtrasAgentOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("revision-analysis-result"),
    result: RevisionAnalysisResultSchema
  }),
  z.object({
    kind: z.literal("book-analysis-result"),
    unitId: UnitIdSchema.optional(),
    result: LongBookAnalysisResultSchema
  }),
  z.object({
    kind: z.literal("book-analysis-note"),
    unitId: UnitIdSchema,
    note: LongBookAnalysisNoteWriteSchema
  }),
  z.object({
    kind: z.literal("style-comparison-result"),
    result: StyleComparisonResultSchema
  })
]);
export type ExtrasAgentOutput = z.infer<typeof ExtrasAgentOutputSchema>;

export const ExtrasAgentOutputUpdatedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  agentId: ExtrasAgentIdSchema,
  jobId: z.string().trim().min(1).max(120),
  /** Absent when the output was parsed from the final assistant message. */
  toolCallId: z.string().min(1).optional(),
  output: ExtrasAgentOutputSchema,
  runtime: AgentRuntimeRefSchema
});
export type ExtrasAgentOutputUpdatedPayload = z.infer<
  typeof ExtrasAgentOutputUpdatedPayloadSchema
>;

export const ExtrasAgentOutputUpdatedEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("extras_agent.output_updated"),
    payload: ExtrasAgentOutputUpdatedPayloadSchema
  }).superRefine(validateAgentEventContext);
export type ExtrasAgentOutputUpdatedEventEnvelope = Envelope<
  ExtrasAgentOutputUpdatedPayload,
  "extras_agent.output_updated"
>;
