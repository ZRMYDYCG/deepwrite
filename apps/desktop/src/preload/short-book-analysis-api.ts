import {
  CommandEnvelopeSchema,
  createEnvelope,
  ShortBookAnalysisCatalogSchema,
  ShortBookAnalysisSourceSchema,
  ShortBookAnalysisSourcesSchema,
  ShortBookAnalysisTextInputSchema,
  type ShortBookAnalysisApi,
  type CommandEnvelope
} from "@deepwrite/contracts";
import { browserId, invokeCommand } from "./invoke";
async function request(
  type: CommandEnvelope["type"],
  payload: unknown
): Promise<unknown> {
  const id = browserId("short_analysis");
  return invokeCommand(
    CommandEnvelopeSchema.parse(
      createEnvelope(type, payload, { id, correlationId: id })
    )
  );
}
export const shortBookAnalysisApi: ShortBookAnalysisApi = {
  chooseSources: async () =>
    ShortBookAnalysisSourcesSchema.nullable().parse(
      await request("shortBookAnalysis.chooseSources", {})
    ),
  addText: async (input) =>
    ShortBookAnalysisSourceSchema.parse(
      await request(
        "shortBookAnalysis.addText",
        ShortBookAnalysisTextInputSchema.parse(input)
      )
    ),
  sources: {
    list: async () =>
      ShortBookAnalysisCatalogSchema.parse(
        await request("shortBookAnalysis.listSources", {})
      ),
    load: async (sourceId) =>
      ShortBookAnalysisSourceSchema.parse(
        await request("shortBookAnalysis.loadSource", { sourceId })
      ),
    delete: async (sourceId) =>
      ShortBookAnalysisSourceSchema.shape.id.parse(
        await request("shortBookAnalysis.deleteSource", { sourceId })
      )
  }
};
