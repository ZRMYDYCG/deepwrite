import {
  CommandEnvelopeSchema,
  createEnvelope,
  DecompositionQueryResultSchema,
  DecompositionReceiptSchema,
  DecompositionUnitSchema,
  type DecompositionQuery,
  type DecompositionSubmitInput,
  type DecompositionTopicPlanInput
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";
import type { UtilityCommandHandlerContext } from "./runtime";

/** Dedicated bridge: Main binds every request to the accepted package. */
export function createDecompositionServices(
  context: UtilityCommandHandlerContext,
  sessionId: string,
  runId: string
) {
  async function request(
    type:
      | "longBookDecomposition.query"
      | "longBookDecomposition.submitUnit"
      | "longBookDecomposition.planTopic",
    jobId: string,
    payload: unknown
  ) {
    const id = createId("cmd_decomposition");
    const command = CommandEnvelopeSchema.parse(
      createEnvelope(type, payload, {
        id,
        context: { sessionId, runId, resourceId: jobId, correlationId: id }
      })
    );
    const result = await context.requestInternalCommand("core", command, {
      timeoutMs: 120_000
    });
    if (result.status !== "accepted") throw new Error(result.error.message);
    return result.payload;
  }
  return {
    decompositionQuery: async (jobId: string, query: DecompositionQuery) =>
      DecompositionQueryResultSchema.parse(
        await request("longBookDecomposition.query", jobId, {
          jobId,
          request: query
        })
      ),
    decompositionPlanTopic: async (input: DecompositionTopicPlanInput) => {
      const result = (await request(
        "longBookDecomposition.planTopic",
        input.jobId,
        input
      )) as { unitId: string; unit: unknown };
      return {
        unitId: result.unitId,
        unit: DecompositionUnitSchema.parse(result.unit)
      };
    },
    decompositionSubmit: async (input: DecompositionSubmitInput) =>
      DecompositionReceiptSchema.parse(
        await request("longBookDecomposition.submitUnit", input.jobId, input)
      )
  };
}
