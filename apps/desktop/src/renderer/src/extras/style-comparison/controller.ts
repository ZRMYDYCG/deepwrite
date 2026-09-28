import { computed, ref } from "vue";
import { createId } from "@deepwrite/shared";
import type {
  DeepWriteApi,
  ModelConfig,
  StyleComparisonProfile,
  ThinkingLevel,
  SystemEventEnvelope
} from "@deepwrite/contracts";
import {
  STYLE_COMPARISON_METHOD_LIMIT,
  StyleComparisonInputSchema,
  StyleComparisonRuntimeContextSchema,
  assertExtrasAgentBudget,
  type StyleComparisonResult
} from "@deepwrite/contracts/renderer";
import {
  startExtrasAgentTask,
  type ExtrasAgentTaskHandle
} from "../agent-runtime/extrasAgentTask";
import type { createPromptProfile } from "../agent-runtime/promptProfile";
import { styleComparisonPreview } from "./result";

type Status =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "completed"
  | "error";
interface Options {
  api(): Pick<DeepWriteApi, "extrasAgents" | "session" | "events"> | undefined;
  /** The saved comparison method; `systemPrompt` is the editable text. */
  method: ReturnType<typeof createPromptProfile>;
  notifyError(message: string): void;
}

export function createStyleComparisonController(options: Options) {
  const referenceText = ref("");
  const comparisonText = ref("");
  const method = options.method.systemPrompt;
  const modelId = ref("");
  const thinkingLevel = ref<ThinkingLevel>("off");
  let thinkingModelId = "";
  const status = ref<Status>("idle");
  const activity = ref("");
  const output = ref("");
  const result = ref<StyleComparisonResult | null>(null);
  const lastInput = ref("");
  const resultModel = ref("");
  const isBusy = computed(() =>
    ["starting", "running", "stopping"].includes(status.value)
  );
  const preview = computed(() => styleComparisonPreview(output.value));
  const inputSnapshot = () =>
    JSON.stringify({
      referenceText: referenceText.value.trim(),
      comparisonText: comparisonText.value.trim(),
      method: method.value.trim()
    });
  const isStale = computed(() =>
    Boolean(lastInput.value && lastInput.value !== inputSnapshot())
  );
  let task: ExtrasAgentTaskHandle | null = null;
  let stopRequested = false;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;

  function fail(cause: unknown): void {
    status.value = "error";
    activity.value = "比对未完成";
    options.notifyError(
      cause instanceof Error ? cause.message : "文风比对失败，请重试。"
    );
  }

  function markStopped(): void {
    status.value = "stopped";
    activity.value = "已停止比对";
  }

  function handleEvent(event: SystemEventEnvelope): void {
    task?.handleEvent(event);
  }

  async function start(model: ModelConfig | undefined): Promise<void> {
    if (disposed || isBusy.value) return;
    const api = options.api();
    if (!api) {
      options.notifyError("当前环境无法调用智能体。");
      return;
    }
    if (!model || model.enabled === false) {
      options.notifyError("请先配置并选择一个可用模型。");
      return;
    }
    syncThinkingModel(model);
    const parsed = StyleComparisonInputSchema.safeParse({
      referenceText: referenceText.value,
      comparisonText: comparisonText.value
    });
    if (
      !parsed.success ||
      method.value.length > STYLE_COMPARISON_METHOD_LIMIT
    ) {
      options.notifyError(
        "请填写两份文本，每份不超过 30,000 字，比对方法不超过 8,000 字。"
      );
      return;
    }
    const input = StyleComparisonRuntimeContextSchema.parse({
      ...parsed.data,
      jobId: createId("style_comparison_job")
    });
    try {
      assertExtrasAgentBudget(
        {
          agentId: "style-comparison",
          profile: {
            id: "pending",
            name: "文风比对",
            description: "文风比对",
            systemPrompt: method.value.trim()
          },
          input
        },
        model
      );
    } catch (error) {
      options.notifyError(
        error instanceof Error ? error.message : "文风比对失败，请重试。"
      );
      return;
    }
    unsubscribe ??= api.events.subscribe(handleEvent);
    stopRequested = false;
    status.value = "starting";
    activity.value = "正在连接比对智能体…";
    output.value = "";
    result.value = null;
    lastInput.value = inputSnapshot();
    resultModel.value = model.label;
    let profile: StyleComparisonProfile;
    try {
      profile = (await options.method.ensureSaved()) as StyleComparisonProfile;
    } catch (error) {
      if (!disposed) fail(error);
      return;
    }
    if (disposed) return;
    if (stopRequested) {
      markStopped();
      return;
    }
    let submitted: StyleComparisonResult | undefined;
    const running = startExtrasAgentTask(
      api,
      {
        modelId: model.id,
        thinkingLevel: thinkingLevel.value,
        task: { agentId: "style-comparison", profileId: profile.id, input }
      },
      {
        onAccepted() {
          // Terminal events can arrive before the run acceptance.
          if (status.value === "starting") status.value = "running";
        },
        onTurnStarted(attempt) {
          status.value = "running";
          output.value = "";
          activity.value =
            attempt > 1 ? "正在重新连接模型…" : "正在阅读两份文本…";
        },
        onRetryScheduled(delayMs) {
          output.value = "";
          activity.value = `连接暂时中断，${Math.ceil(delayMs / 1000)} 秒后重试…`;
        },
        onDelta(delta) {
          output.value += delta;
          activity.value = "正在整理关键发现与评分…";
        },
        onThinking() {
          activity.value = "正在思考，分析两份文本的文风…";
        },
        onOutput(next) {
          if (next.kind === "style-comparison-result") submitted = next.result;
        }
      }
    );
    task = running;
    void running.outcome.then(
      (outcome) => {
        if (task !== running) return;
        task = null;
        if (outcome.status === "stopped") {
          markStopped();
          return;
        }
        output.value = outcome.content;
        if (!submitted) {
          fail(new Error("模型未返回完整的比对结论与有效评分，请重新比对。"));
          return;
        }
        result.value = submitted;
        status.value = "completed";
        activity.value = "比对完成";
      },
      (error: unknown) => {
        if (task !== running) return;
        task = null;
        if (!disposed) fail(error);
      }
    );
  }

  async function stop(): Promise<void> {
    if (!isBusy.value || stopRequested) return;
    stopRequested = true;
    status.value = "stopping";
    activity.value = "正在停止…";
    if (!task) return; // start() stops once the method is saved.
    try {
      await task.stop();
    } catch (error) {
      stopRequested = false;
      status.value = "running";
      activity.value = "比对仍在进行，可再次停止";
      options.notifyError(
        error instanceof Error ? error.message : "停止比对失败，请重试。"
      );
    }
  }

  function dispose(): void {
    disposed = true;
    unsubscribe?.();
    const current = task;
    task = null;
    current?.dispose();
  }

  function syncThinkingModel(model: ModelConfig | undefined): void {
    if (isBusy.value) return;
    if (
      thinkingModelId !== (model?.id ?? "") ||
      (thinkingLevel.value !== "off" &&
        !model?.thinkingLevelOptions.includes(thinkingLevel.value))
    ) {
      thinkingLevel.value = model?.defaultThinkingLevel ?? "off";
    }
    thinkingModelId = model?.id ?? "";
  }

  return {
    referenceText,
    comparisonText,
    method,
    modelId,
    thinkingLevel,
    syncThinkingModel,
    status,
    activity,
    result,
    resultModel,
    preview,
    isBusy,
    isStale,
    start,
    stop,
    dispose,
    handleEvent
  };
}
