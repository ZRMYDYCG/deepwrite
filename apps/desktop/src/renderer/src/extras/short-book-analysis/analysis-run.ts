import { presetLabel } from "../analysis-ui/preset-labels";
import { formatError } from "../../i18n/errors";
import {
  localizedMessage,
  resolveLocalizedText,
  type LocalizedText,
  localizedTextRef,
  localizedNullableTextRef
} from "../analysis-ui/localized-text";
import { createScopedTranslator, locale } from "../../i18n";
import { computed, ref, shallowRef } from "vue";
import { createId } from "@deepwrite/shared";
import {
  ShortBookAnalysisRuntimeContextSchema,
  assertExtrasAgentBudget,
  type DeepWriteApi,
  type ModelConfig,
  type ShortBookAnalysisPreset,
  type ShortBookAnalysisResult,
  type ShortBookAnalysisSource,
  type SystemEventEnvelope,
  type ThinkingLevel
} from "@deepwrite/contracts/renderer";
import type { AnalysisProcessEntry } from "../analysis-ui/analysis-process";
import {
  startExtrasAgentTask,
  type ExtrasAgentTaskHandle
} from "../agent-runtime/extrasAgentTask";

const t = createScopedTranslator("extras");
interface Job {
  context: ReturnType<typeof ShortBookAnalysisRuntimeContextSchema.parse>;
  preset: ShortBookAnalysisPreset;
  model: ModelConfig;
  thinkingLevel: ThinkingLevel;
}
export function createShortAnalysisRun(api: () => DeepWriteApi) {
  const status = ref<
    "idle" | "running" | "stopping" | "stopped" | "error" | "completed"
  >("idle");
  const result = ref<ShortBookAnalysisResult | null>(null);
  const preset = shallowRef<ShortBookAnalysisPreset | null>(null);
  const resultPreset = shallowRef<ShortBookAnalysisPreset | null>(null);
  const resultContext = ref("");
  const resultIsPrevious = computed(
    () => Boolean(result.value) && status.value !== "completed"
  );
  const error = localizedNullableTextRef();
  const liveOutput = ref("");
  const activity = localizedTextRef(
    localizedMessage("extras.analysisUi.waitingToStart")
  );
  const entries = ref<(AnalysisProcessEntry & { createdAt: string })[]>([]);
  const isBusy = computed(
    () => status.value === "running" || status.value === "stopping"
  );
  let job: Job | null = null;
  let task: ExtrasAgentTaskHandle | null = null;
  let disposed = false;
  const canRetry = computed(
    () => status.value === "stopped" || status.value === "error"
  );
  function log(
    message: LocalizedText,
    detail?: LocalizedText,
    tone: AnalysisProcessEntry["tone"] = "info"
  ) {
    activity.value = message;
    entries.value = [
      ...entries.value,
      {
        id: createId("short_analysis_process"),
        createdAt: new Date().toISOString(),
        get title() {
          return resolveLocalizedText(message);
        },
        get detail() {
          return detail ? resolveLocalizedText(detail) : "";
        },
        tone,
        phase: null
      }
    ];
    if (entries.value.length > 120)
      entries.value.splice(1, entries.value.length - 120);
  }
  function setActivity(message: LocalizedText) {
    if (activity.value !== resolveLocalizedText(message)) log(message);
  }
  function clear() {
    if (isBusy.value)
      throw new Error(t("revisionAnalysis.inputsLockedWhileRunning"));
    job = null;
    preset.value = null;
    status.value = "idle";
    error.value = null;
    entries.value = [];
    liveOutput.value = "";
    activity.value = localizedMessage("extras.analysisUi.waitingToStart");
  }
  function resetWorkspace() {
    clear();
    result.value = null;
    resultPreset.value = null;
    resultContext.value = "";
  }
  function fail(cause: unknown) {
    status.value = "error";
    const message = () =>
      formatError(cause, t("shortBookAnalysis.shortAnalysisFailed"));
    error.value = message;
    log(message, undefined, "error");
  }
  function execute() {
    if (!job || disposed) return;
    const current = job;
    assertExtrasAgentBudget(
      {
        agentId: "short-book-analysis",
        profile: current.preset,
        input: current.context
      },
      current.model
    );
    status.value = "running";
    error.value = null;
    liveOutput.value = "";
    entries.value = [];
    log(
      localizedMessage("extras.shortBookAnalysis.analyzingStoriesTogether", {
        count: current.context.books.length
      }),
      () =>
        t("shortBookAnalysis.shortRunSummary", {
          preset: presetLabel(current.preset),
          books: current.context.books.map((book) => book.title).join("、"),
          characters: current.context.books
            .reduce((total, book) => total + book.text.length, 0)
            .toLocaleString(locale.value)
        })
    );
    log(localizedMessage("extras.shortBookAnalysis.submittingAnalysis"));
    let submitted: ShortBookAnalysisResult | undefined;
    const running = startExtrasAgentTask(
      api(),
      {
        modelId: current.model.id,
        thinkingLevel: current.thinkingLevel,
        task: {
          agentId: "short-book-analysis",
          profileId: current.preset.id,
          input: current.context
        }
      },
      {
        onAccepted() {
          if (activity.value === t("shortBookAnalysis.submittingAnalysis"))
            log(
              localizedMessage("extras.shortBookAnalysis.awaitingModelResponse")
            );
        },
        onDelta(delta) {
          setActivity(
            localizedMessage("extras.shortBookAnalysis.modelDescribingAnalysis")
          );
          liveOutput.value = (liveOutput.value + delta).slice(-200000);
        },
        onThinking() {
          setActivity(
            localizedMessage("extras.shortBookAnalysis.modelAnalyzingText")
          );
        },
        onToolRequested() {
          log(
            localizedMessage(
              "extras.shortBookAnalysis.generatingStructuredResult"
            )
          );
        },
        onToolCompleted(_toolName, isError) {
          if (isError)
            log(
              localizedMessage(
                "extras.shortBookAnalysis.resultGenerationError"
              ),
              localizedMessage(
                "extras.shortBookAnalysis.waitingModelCorrection"
              ),
              "error"
            );
        },
        onOutput(output) {
          if (output.kind !== "book-analysis-result") return;
          submitted = output.result;
          log(
            localizedMessage("extras.shortBookAnalysis.structuredResultReady"),
            output.result.name,
            "success"
          );
        }
      }
    );
    task = running;
    void running.outcome.then(
      (outcome) => {
        if (task !== running) return;
        task = null;
        if (outcome.status === "stopped") {
          status.value = "stopped";
          log(localizedMessage("extras.revisionAnalysis.stoppedCanAnalyze"));
          return;
        }
        if (!liveOutput.value.trim() && outcome.content.trim())
          liveOutput.value = outcome.content.slice(-200000);
        if (!submitted) {
          fail(new Error(t("shortBookAnalysis.structuredResultMissing")));
          return;
        }
        result.value = submitted;
        resultPreset.value = current.preset;
        resultContext.value = current.context.books
          .map((book) => book.title)
          .join("、");
        status.value = "completed";
        log(
          localizedMessage("extras.revisionAnalysis.resultReadyToEdit"),
          undefined,
          "success"
        );
      },
      (cause: unknown) => {
        if (task !== running) return;
        task = null;
        fail(cause);
      }
    );
  }
  function start(
    books: ShortBookAnalysisSource[],
    selectedPreset: ShortBookAnalysisPreset,
    model: ModelConfig,
    thinkingLevel: ThinkingLevel
  ) {
    if (isBusy.value) throw new Error(t("shortBookAnalysis.analysisRunning"));
    if (
      thinkingLevel !== "off" &&
      !model.thinkingLevelOptions.includes(thinkingLevel)
    )
      throw new Error(t("revisionAnalysis.supportedThinkingRequired"));
    const context = ShortBookAnalysisRuntimeContextSchema.parse({
      jobId: createId("short_analysis_job"),
      books
    });
    assertExtrasAgentBudget(
      {
        agentId: "short-book-analysis",
        profile: selectedPreset,
        input: context
      },
      model
    );
    const snapshot = JSON.parse(
      JSON.stringify({
        context,
        preset: selectedPreset,
        model,
        thinkingLevel
      })
    ) as Job;
    job = snapshot;
    preset.value = snapshot.preset;
    execute();
  }
  return {
    status,
    result,
    preset,
    resultPreset,
    resultContext,
    resultIsPrevious,
    error,
    liveOutput,
    activity,
    entries,
    isBusy,
    canRetry,
    clear,
    resetWorkspace,
    start,
    handleEvent(event: SystemEventEnvelope) {
      task?.handleEvent(event);
    },
    retry() {
      if (canRetry.value && !isBusy.value) execute();
    },
    async stop() {
      if (!isBusy.value || !task) return;
      status.value = "stopping";
      log(localizedMessage("extras.analysisUi.stopping"));
      try {
        await task.stop();
      } catch (cause: unknown) {
        status.value = "running";
        const message = () => formatError(cause, t("agentRuntime.stopFailed"));
        error.value = message;
        log(message, undefined, "error");
      }
    },
    dispose() {
      disposed = true;
      const current = task;
      task = null;
      current?.dispose();
    }
  };
}
