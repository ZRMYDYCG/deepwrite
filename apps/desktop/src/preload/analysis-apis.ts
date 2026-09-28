import {
  chooseLongBookAnalysisSource,
  listLongBookAnalysisSources,
  loadLongBookAnalysisSource
} from "./long-book-analysis-api";
import { extrasAgentApi } from "./extras-agent-api";
import { shortBookAnalysisApi } from "./short-book-analysis-api";
export const analysisApis = {
  extrasAgents: extrasAgentApi,
  shortBookAnalysis: shortBookAnalysisApi,
  longBookAnalysis: {
    chooseSource: chooseLongBookAnalysisSource,
    sources: {
      list: listLongBookAnalysisSources,
      load: loadLongBookAnalysisSource
    }
  }
};
