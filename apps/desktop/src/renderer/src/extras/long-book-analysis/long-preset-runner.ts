import { computed, ref, type ShallowRef } from "vue";
import type {
  DeepWriteApi,
  LongBookAnalysisPreset,
  LongBookAnalysisResult,
  LongBookAnalysisSource,
  ModelConfig
} from "@deepwrite/contracts/renderer";
import {
  localizedNullableTextRef,
  localizedTextRef
} from "../analysis-ui/localized-text";
import type {
  AnalysisPresetRunner,
  PresetRunStatus
} from "../analysis-ui/preset-runner";
import { LongBookAnalysisPipeline } from "./analysis-pipeline";
import type {
  LongBookAnalysisPhase,
  LongBookAnalysisRangeInput
} from "./analysis-pipeline-types";
import {
  formatAnalysisProgress,
  type LongBookAnalysisProcessEntry
} from "./analysis-process";

/**
 * One preset's batch → reduce → final pipeline with its own state, prepared
 * immediately so an invalid range or model fails before the batch starts.
 */
export function createLongPresetRunner(options: {
  api: () => DeepWriteApi;
  models: ShallowRef<readonly ModelConfig[]>;
  source: LongBookAnalysisSource;
  preset: LongBookAnalysisPreset;
  range: LongBookAnalysisRangeInput;
}): AnalysisPresetRunner<LongBookAnalysisResult> {
  const status = ref<PresetRunStatus>("idle");
  const phase = ref<LongBookAnalysisPhase | null>(null);
  const completedUnits = ref(0);
  const estimatedUnits = ref(0);
  const error = localizedNullableTextRef();
  const result = ref<LongBookAnalysisResult | null>(null);
  const processEntries = ref<LongBookAnalysisProcessEntry[]>([]);
  const currentActivity = localizedTextRef();
  const liveOutput = ref("");
  const pipeline = new LongBookAnalysisPipeline(options.api, options.models, {
    status,
    phase,
    completedUnits,
    estimatedUnits,
    error,
    result,
    processEntries,
    currentActivity,
    liveOutput
  });
  pipeline.prepare(options.source, options.preset, options.range);
  return {
    status,
    result,
    entries: processEntries,
    activity: currentActivity,
    liveOutput,
    error,
    progressText: computed(() =>
      formatAnalysisProgress(
        phase.value,
        completedUnits.value,
        estimatedUnits.value
      )
    ),
    errorCode: () => pipeline.errorCode,
    start: () => pipeline.begin(),
    retry: () => {
      pipeline.retry();
    },
    stop: () => pipeline.stop(),
    handleEvent: (event) => pipeline.handleEvent(event),
    dispose: () => pipeline.dispose()
  };
}
