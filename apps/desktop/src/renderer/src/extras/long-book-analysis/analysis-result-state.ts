import {
  localizedTextRef,
  type LocalizedText
} from "../analysis-ui/localized-text";
import { t } from "../../i18n";
import { computed, ref, shallowRef, watch, type Ref } from "vue";
import type {
  DeepWriteApi,
  LongBookAnalysisPreset,
  LongBookAnalysisResult
} from "@deepwrite/contracts/renderer";
import { analysisResultEntry } from "./analysis-result-content";
import type {
  LongBookAnalysisPersistInput,
  LongBookAnalysisRunStatus
} from "./useLongBookAnalysis";

/** Completed output keeps its own identity while the next task runs. */
export function createLongAnalysisResultState(options: {
  api: () => DeepWriteApi;
  status: Ref<LongBookAnalysisRunStatus>;
  pendingResult: Ref<LongBookAnalysisResult | null>;
  preset: () => LongBookAnalysisPreset | null;
}) {
  const result = ref<LongBookAnalysisResult | null>(null);
  const resultPreset = shallowRef<LongBookAnalysisPreset | null>(null);
  const resultContext = localizedTextRef();
  let pendingContext: LocalizedText = "";
  const resultIsPrevious = computed(
    () => Boolean(result.value) && options.status.value !== "completed"
  );
  const activePresetId = computed(() => resultPreset.value?.id ?? "");
  const stopWatch = watch(
    options.status,
    (next) => {
      const preset = options.preset();
      if (next !== "completed" || !options.pendingResult.value || !preset)
        return;
      result.value = options.pendingResult.value;
      resultPreset.value = JSON.parse(
        JSON.stringify(preset)
      ) as LongBookAnalysisPreset;
      resultContext.value = pendingContext;
    },
    { flush: "sync" }
  );

  async function persistResult(
    input: LongBookAnalysisPersistInput
  ): Promise<void> {
    const preset = resultPreset.value;
    if (!preset || !result.value)
      throw new Error(t("extras.longBookAnalysis.noResultToSave"));
    const output = preset.output;
    const entry = {
      libraryId: input.libraryId,
      ...analysisResultEntry(result.value, output.domain),
      ...(input.baseProjectRevision === undefined
        ? {}
        : { baseProjectRevision: input.baseProjectRevision })
    };
    if (output.domain === "material") {
      await options.api().catalog.createLibraryEntry({
        domain: "material",
        stageId: output.stageId,
        ...entry
      });
    } else {
      await options.api().catalog.createLibraryEntry({
        domain: "skill",
        stageId: output.stageId,
        ...entry
      });
    }
  }
  return {
    result,
    resultPreset,
    resultContext,
    resultIsPrevious,
    activePresetId,
    setPendingContext(context: LocalizedText) {
      pendingContext = context;
    },
    persistResult,
    dispose: stopWatch
  };
}
