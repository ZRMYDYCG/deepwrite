import {
  chooseLongBookAnalysisSource,
  listLongBookAnalysisSources,
  loadLongBookAnalysisSource,
  deleteLongBookAnalysisSource,
  saveLongBookAnalysisSource,
  confirmLongBookAnalysisSource
} from "./long-book-analysis-api";
import { extrasAgentApi } from "./extras-agent-api";
import { shortBookAnalysisApi } from "./short-book-analysis-api";
import { longBookDecompositionApi } from "./long-book-decomposition-api";
export const analysisApis = {
  extrasAgents: extrasAgentApi,
  shortBookAnalysis: shortBookAnalysisApi,
  longBookDecomposition: longBookDecompositionApi,
  longBookAnalysis: {
    chooseSource: chooseLongBookAnalysisSource,
    sources: {
      list: listLongBookAnalysisSources,
      load: loadLongBookAnalysisSource,
      delete: deleteLongBookAnalysisSource,
      save: saveLongBookAnalysisSource,
      confirm: confirmLongBookAnalysisSource
    }
  }
};
