import {
  localizedMessage,
  resolveLocalizedText,
  type LocalizedText,
  localizedTextRef,
  localizedNullableTextRef
} from "../analysis-ui/localized-text";
import { ref } from "vue";
import type { ExtrasAgentTaskCallbacks } from "../agent-runtime/extrasAgentTask";

interface ProcessEntry {
  id: string;
  createdAt: string;
  title: string;
  detail?: string;
  tone: "info" | "success" | "error";
}

/** Records observable run events without retaining the model's thinking text. */
export function createStyleComparisonProcess() {
  const entries = ref<ProcessEntry[]>([]);
  const activity = localizedTextRef();
  const output = ref("");
  const error = localizedNullableTextRef();
  let sequence = 0;

  function record(
    title: LocalizedText,
    detail?: LocalizedText,
    tone: ProcessEntry["tone"] = "info"
  ): void {
    entries.value.push({
      id: `style_process_${++sequence}`,
      createdAt: new Date().toISOString(),
      get title() {
        return resolveLocalizedText(title);
      },
      get detail() {
        return detail ? resolveLocalizedText(detail) : "";
      },
      tone
    });
    if (entries.value.length > 120) entries.value.splice(1, 1);
  }

  function updateActivity(title: LocalizedText): void {
    if (activity.value !== resolveLocalizedText(title)) record(title);
    activity.value = title;
  }

  function reset(modelLabel: string): void {
    entries.value = [];
    output.value = "";
    error.value = null;
    sequence = 0;
    activity.value = localizedMessage("extras.styleComparison.connectingAgent");
    record(
      localizedMessage("extras.styleComparison.startComparison"),
      modelLabel
    );
  }
  function clear(): void {
    entries.value = [];
    output.value = "";
    error.value = null;
    activity.value = "";
    sequence = 0;
  }

  const callbacks: ExtrasAgentTaskCallbacks = {
    onTurnStarted(attempt) {
      output.value = "";
      updateActivity(
        attempt > 1
          ? localizedMessage("extras.styleComparison.reconnectingModel")
          : localizedMessage("extras.styleComparison.readingTexts")
      );
    },
    onRetryScheduled(delayMs) {
      output.value = "";
      updateActivity(
        localizedMessage("extras.styleComparison.connectionRetry", {
          seconds: Math.ceil(delayMs / 1000)
        })
      );
    },
    onDelta(delta) {
      output.value += delta;
      updateActivity(
        localizedMessage("extras.styleComparison.organizingFindings")
      );
    },
    onThinking() {
      updateActivity(localizedMessage("extras.styleComparison.analyzingStyle"));
    },
    onToolRequested(toolName) {
      activity.value = localizedMessage("extras.styleComparison.runningTool");
      record(localizedMessage("extras.styleComparison.toolStarted"), toolName);
    },
    onToolCompleted(toolName, isError) {
      record(
        isError
          ? localizedMessage("extras.styleComparison.toolExecutionFailed")
          : localizedMessage("extras.styleComparison.toolExecutionComplete"),
        toolName,
        isError ? "error" : "success"
      );
    }
  };

  return {
    entries,
    activity,
    output,
    error,
    record,
    updateActivity,
    reset,
    clear,
    callbacks
  };
}
