import {
  type LongBookAnalysisSavedSourceCatalog,
  LongBookAnalysisSavedSourceCatalogSchema,
  LongBookAnalysisSavedSourceIdSchema,
  type LongBookAnalysisSource,
  type LongBookAnalysisSourceKind,
  LongBookAnalysisSourceKindSchema,
  LongBookAnalysisSourceSchema,
  createEnvelope
} from "@deepwrite/contracts";
import {
  SaveLongBookSourceInputSchema,
  ConfirmLongBookSourceInputSchema,
  DecompositionSourceConfirmationSchema,
  type SaveLongBookSourceInput,
  type ConfirmLongBookSourceInput
} from "@deepwrite/contracts";
import { browserId, invokeCommand } from "./invoke";
export async function chooseLongBookAnalysisSource(
  rawKind: LongBookAnalysisSourceKind
): Promise<LongBookAnalysisSource | null> {
  const kind = LongBookAnalysisSourceKindSchema.parse(rawKind);
  const id = browserId("cmd_long_book_analysis_choose_source");
  return LongBookAnalysisSourceSchema.nullable().parse(
    await invokeCommand<LongBookAnalysisSource | null>(
      createEnvelope(
        "longBookAnalysis.chooseSource",
        { kind },
        { id, correlationId: id }
      )
    )
  );
}

export async function listLongBookAnalysisSources(): Promise<LongBookAnalysisSavedSourceCatalog> {
  const id = browserId("cmd_long_book_analysis_sources_list");
  return LongBookAnalysisSavedSourceCatalogSchema.parse(
    await invokeCommand<LongBookAnalysisSavedSourceCatalog>(
      createEnvelope(
        "longBookAnalysis.listSources",
        {},
        { id, correlationId: id }
      )
    )
  );
}

export async function loadLongBookAnalysisSource(
  rawSourceId: string
): Promise<LongBookAnalysisSource> {
  const sourceId = LongBookAnalysisSavedSourceIdSchema.parse(rawSourceId);
  const id = browserId("cmd_long_book_analysis_source_load");
  return LongBookAnalysisSourceSchema.parse(
    await invokeCommand<LongBookAnalysisSource>(
      createEnvelope(
        "longBookAnalysis.loadSource",
        { sourceId },
        { id, correlationId: id }
      )
    )
  );
}

export async function deleteLongBookAnalysisSource(
  rawSourceId: string
): Promise<string> {
  const sourceId = LongBookAnalysisSavedSourceIdSchema.parse(rawSourceId);
  const id = browserId("cmd_long_book_analysis_source_delete");
  return LongBookAnalysisSavedSourceIdSchema.parse(
    await invokeCommand<string>(
      createEnvelope(
        "longBookAnalysis.deleteSource",
        { sourceId },
        { id, correlationId: id }
      )
    )
  );
}

export async function saveLongBookAnalysisSource(raw: SaveLongBookSourceInput) {
  const id = browserId("cmd_long_book_source_save");
  return LongBookAnalysisSourceSchema.parse(
    await invokeCommand(
      createEnvelope(
        "longBookAnalysis.saveSource",
        SaveLongBookSourceInputSchema.parse(raw),
        { id, correlationId: id }
      )
    )
  );
}
export async function confirmLongBookAnalysisSource(
  raw: ConfirmLongBookSourceInput
) {
  const id = browserId("cmd_long_book_source_confirm");
  return DecompositionSourceConfirmationSchema.parse(
    await invokeCommand(
      createEnvelope(
        "longBookAnalysis.confirmSource",
        ConfirmLongBookSourceInputSchema.parse(raw),
        { id, correlationId: id }
      )
    )
  );
}
