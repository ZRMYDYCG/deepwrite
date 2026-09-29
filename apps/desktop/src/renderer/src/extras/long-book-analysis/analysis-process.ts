import {
  localizedMessage,
  resolveLocalizedText,
  type LocalizedText
} from "../analysis-ui/localized-text";
import { createScopedTranslator, locale } from "../../i18n";
import type { Ref } from "vue";
import type { LongBookAnalysisPhase } from "./analysis-pipeline-types";

const t = createScopedTranslator("extras.longBookAnalysis");

export type LongBookAnalysisProcessTone = "info" | "success" | "error";

export interface LongBookAnalysisProcessEntry {
  id: string;
  createdAt: string;
  title: string;
  detail?: string;
  phase: LongBookAnalysisPhase | null;
  tone: LongBookAnalysisProcessTone;
}

export interface LongBookAnalysisProcessState {
  processEntries: Ref<LongBookAnalysisProcessEntry[]>;
  currentActivity: Ref<string, LocalizedText>;
  liveOutput: Ref<string>;
}

const PHASE_LABELS: Record<LongBookAnalysisPhase, string> = {
  get batch() {
    return t("batchExtraction");
  },
  get reduce() {
    return t("mergeNotes");
  },
  get final() {
    return t("generateFinal");
  }
};

const TOOL_LABELS: Record<string, string> = {
  get list_analysis_inputs() {
    return t("checkingInputList");
  },
  get read_analysis_input() {
    return t("readingChaptersNotes");
  },
  get search_analysis_inputs() {
    return t("searchingEvidence");
  },
  get write_analysis_note() {
    return t("savingPhaseNotes");
  },
  get write_analysis_result() {
    return t("generatingEditableResult");
  }
};

export function analysisPhaseLabel(phase: LongBookAnalysisPhase): string {
  return PHASE_LABELS[phase];
}

export function formatAnalysisProgress(
  phase: LongBookAnalysisPhase | null,
  completedUnits: number,
  estimatedUnits: number
): string {
  if (!phase) return t("notStarted");
  const total = Math.max(1, completedUnits, estimatedUnits);
  return t("analysisStepProgress", {
    phase: analysisPhaseLabel(phase),
    completed: Math.min(completedUnits, total),
    total: total
  });
}

export class LongBookAnalysisProcessTracker {
  private sequence = 0;
  private phase: LongBookAnalysisPhase | null = null;

  constructor(private readonly state: LongBookAnalysisProcessState) {}

  reset(): void {
    this.sequence = 0;
    this.phase = null;
    this.state.processEntries.value = [];
    this.state.currentActivity.value = "";
    this.state.liveOutput.value = "";
  }

  start(
    presetName: LocalizedText,
    selectionStart: number,
    selectionEnd: number,
    batchCount: number
  ): void {
    this.reset();
    this.add(
      () =>
        t("startingPreset", {
          name: resolveLocalizedText(presetName)
        }),
      localizedMessage("extras.longBookAnalysis.presetRunScope", {
        start: selectionStart,
        end: selectionEnd,
        batches: batchCount
      })
    );
    this.state.currentActivity.value = localizedMessage(
      "extras.longBookAnalysis.preparingFirstBatch"
    );
  }

  beginUnit(phase: LongBookAnalysisPhase, detail: LocalizedText): void {
    this.phase = phase;
    this.state.liveOutput.value = "";
    this.state.currentActivity.value = () => analysisPhaseLabel(phase);
    this.add(() => analysisPhaseLabel(phase), detail);
  }

  retry(): void {
    this.add(
      localizedMessage("extras.longBookAnalysis.continueRun"),
      localizedMessage("extras.longBookAnalysis.resumeDescription")
    );
    this.state.currentActivity.value = localizedMessage(
      "extras.longBookAnalysis.restartingStep"
    );
  }

  requestStop(): void {
    this.add(
      localizedMessage("extras.analysisUi.stopping"),
      localizedMessage("extras.longBookAnalysis.waitingForRequestEnd")
    );
    this.state.currentActivity.value = localizedMessage(
      "extras.analysisUi.stopping"
    );
  }

  thinking(): void {
    if (this.state.currentActivity.value !== t("organizingPhase"))
      this.add(localizedMessage("extras.longBookAnalysis.organizingPhase"));
    this.state.currentActivity.value = localizedMessage(
      "extras.longBookAnalysis.organizingPhase"
    );
  }

  appendMessage(delta: string): void {
    if (this.state.currentActivity.value !== t("describingPhase"))
      this.add(localizedMessage("extras.longBookAnalysis.describingPhase"));
    const next = `${this.state.liveOutput.value}${delta}`;
    this.state.liveOutput.value = next.slice(-20_000);
    this.state.currentActivity.value = localizedMessage(
      "extras.longBookAnalysis.describingPhase"
    );
  }

  completeMessage(content: string): void {
    if (!this.state.liveOutput.value.trim() && content.trim()) {
      this.state.liveOutput.value = content.slice(-20_000);
    }
    this.state.currentActivity.value = localizedMessage(
      "extras.longBookAnalysis.modelStepComplete"
    );
  }

  toolStarted(toolName: string): void {
    const label = () => TOOL_LABELS[toolName] ?? t("runningAnalysisTool");
    this.state.currentActivity.value = label;
    this.add(label);
  }

  toolCompleted(toolName: string, isError: boolean): void {
    if (isError) {
      this.add(
        () =>
          t("toolFailed", {
            tool: TOOL_LABELS[toolName] ?? t("analysisTool")
          }),
        localizedMessage("extras.longBookAnalysis.modelRetryDecision"),
        "error"
      );
    }
  }

  noteWritten(characterCount: number): void {
    this.add(
      localizedMessage("extras.longBookAnalysis.phaseNotesGenerated"),
      () =>
        t("characters", {
          count: characterCount.toLocaleString(locale.value)
        }),
      "success"
    );
  }

  resultWritten(title: LocalizedText): void {
    this.add(
      localizedMessage("extras.longBookAnalysis.editableResultGenerated"),
      title,
      "success"
    );
    this.state.currentActivity.value = localizedMessage(
      "extras.longBookAnalysis.resultWaitingForStep"
    );
  }

  complete(): void {
    this.add(
      localizedMessage("extras.longBookAnalysis.presetRunComplete"),
      localizedMessage("extras.longBookAnalysis.resultRetainedPreview"),
      "success"
    );
    this.state.currentActivity.value = localizedMessage(
      "extras.longBookAnalysis.runComplete"
    );
  }

  fail(message: LocalizedText): void {
    this.add(
      localizedMessage("extras.longBookAnalysis.runFailed"),
      message,
      "error"
    );
    this.state.currentActivity.value = localizedMessage(
      "extras.longBookAnalysis.runFailedRetry"
    );
  }

  stopped(): void {
    this.add(
      localizedMessage("extras.longBookAnalysis.runStopped"),
      localizedMessage("extras.longBookAnalysis.completedStepsRetained"),
      "info"
    );
    this.state.currentActivity.value = localizedMessage(
      "extras.longBookAnalysis.stoppedCanContinue"
    );
  }

  private add(
    title: LocalizedText,
    detail?: LocalizedText,
    tone: LongBookAnalysisProcessTone = "info"
  ): void {
    this.sequence += 1;
    const entries = [
      ...this.state.processEntries.value,
      {
        id: `analysis_process_${this.sequence}`,
        createdAt: new Date().toISOString(),
        get title() {
          return resolveLocalizedText(title);
        },
        get detail() {
          return detail ? resolveLocalizedText(detail) : "";
        },
        phase: this.phase,
        tone
      }
    ];
    this.state.processEntries.value =
      entries.length > 120 ? [entries[0]!, ...entries.slice(-119)] : entries;
  }
}
