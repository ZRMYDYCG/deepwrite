import type { Ref } from "vue";
import type { LocalizedText } from "../analysis-ui/localized-text";
import type {
  LongBookAnalysisNote,
  LongBookAnalysisPreset,
  LongBookAnalysisResult,
  LongBookAnalysisSegment,
  ThinkingLevel
} from "@deepwrite/contracts/renderer";
import type { LongBookAnalysisRunStatus } from "./useLongBookAnalysis";
import type {
  LongBookAnalysisProcessEntry,
  LongBookAnalysisProcessState
} from "./analysis-process";

export type LongBookAnalysisPhase = "batch" | "reduce" | "final";

export interface LongBookAnalysisPipelineState extends LongBookAnalysisProcessState {
  status: Ref<LongBookAnalysisRunStatus>;
  phase: Ref<LongBookAnalysisPhase | null>;
  completedUnits: Ref<number>;
  estimatedUnits: Ref<number>;
  error: Ref<string | null, LocalizedText | null>;
  result: Ref<LongBookAnalysisResult | null>;
}

export type { LongBookAnalysisProcessEntry };

export interface LongBookAnalysisJob {
  id: string;
  sourceTitle: string;
  preset: LongBookAnalysisPreset;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  selectionStart: number;
  selectionEnd: number;
  inputBudget: number;
  batches: LongBookAnalysisSegment[][];
  batchIndex: number;
  notes: LongBookAnalysisNote[];
  reductionRounds: number;
  reduction?: {
    groups: LongBookAnalysisNote[][];
    groupIndex: number;
    output: LongBookAnalysisNote[];
  };
}
