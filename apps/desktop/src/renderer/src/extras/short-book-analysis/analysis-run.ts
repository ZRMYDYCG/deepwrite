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
import type { LongBookAnalysisProcessEntry } from "../long-book-analysis/analysis-process";
import {
  startExtrasAgentTask,
  type ExtrasAgentTaskHandle
} from "../agent-runtime/extrasAgentTask";
interface Job {
  context: ReturnType<typeof ShortBookAnalysisRuntimeContextSchema.parse>;
  preset: ShortBookAnalysisPreset;
  model: ModelConfig;
  thinkingLevel: ThinkingLevel;
  libraryId: string;
}
export function createShortAnalysisRun(api: () => DeepWriteApi) {
  const status = ref<
    "idle" | "running" | "stopping" | "stopped" | "error" | "completed"
  >("idle");
  const result = ref<ShortBookAnalysisResult | null>(null);
  const preset = shallowRef<ShortBookAnalysisPreset | null>(null);
  const targetLibraryId = ref("");
  const error = ref<string | null>(null);
  const liveOutput = ref("");
  const activity = ref("等待开始");
  const entries = ref<LongBookAnalysisProcessEntry[]>([]);
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
    message: string,
    detail?: string,
    tone: LongBookAnalysisProcessEntry["tone"] = "info"
  ) {
    activity.value = message;
    entries.value = [
      ...entries.value,
      {
        id: createId("short_analysis_process"),
        createdAt: new Date().toISOString(),
        title: message,
        ...(detail ? { detail } : {}),
        tone,
        phase: null
      }
    ];
    if (entries.value.length > 120)
      entries.value.splice(1, entries.value.length - 120);
  }
  function setActivity(message: string) {
    if (activity.value !== message) log(message);
  }
  function clear() {
    if (isBusy.value) throw new Error("分析运行中，不能修改输入。");
    job = null;
    result.value = null;
    preset.value = null;
    status.value = "idle";
    error.value = null;
    entries.value = [];
    liveOutput.value = "";
    activity.value = "等待开始";
  }
  function fail(cause: unknown) {
    status.value = "error";
    error.value = cause instanceof Error ? cause.message : "短篇拆书失败。";
    log(error.value, undefined, "error");
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
    result.value = null;
    liveOutput.value = "";
    entries.value = [];
    log(
      `正在联合分析 ${current.context.books.length} 本短篇`,
      `预设：${current.preset.name} · ${current.context.books.map((book) => book.title).join("、")} · 共 ${current.context.books.reduce((total, book) => total + book.text.length, 0).toLocaleString()} 字符`
    );
    log("正在提交分析请求");
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
          if (activity.value === "正在提交分析请求")
            log("请求已接收，等待模型响应");
        },
        onDelta(delta) {
          setActivity("模型正在输出分析说明");
          liveOutput.value = (liveOutput.value + delta).slice(-200000);
        },
        onThinking() {
          setActivity("模型正在分析全文");
        },
        onToolRequested() {
          log("正在生成结构化结果");
        },
        onToolCompleted(_toolName, isError) {
          if (isError)
            log("生成结果时遇到错误", "等待模型修正或重试当前动作", "error");
        },
        onOutput(output) {
          if (output.kind !== "book-analysis-result") return;
          submitted = output.result;
          log("结构化结果已生成", output.result.name, "success");
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
          log("已停止，可重新分析");
          return;
        }
        if (!liveOutput.value.trim() && outcome.content.trim())
          liveOutput.value = outcome.content.slice(-200000);
        if (!submitted) {
          fail(new Error("模型未提交结构化结果，请重新分析。"));
          return;
        }
        result.value = submitted;
        status.value = "completed";
        log("分析完成，结果可编辑并保存", undefined, "success");
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
    thinkingLevel: ThinkingLevel,
    libraryId: string
  ) {
    if (isBusy.value) throw new Error("分析正在运行。");
    if (
      thinkingLevel !== "off" &&
      !model.thinkingLevelOptions.includes(thinkingLevel)
    )
      throw new Error("请选择当前模型支持的思考等级。");
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
        thinkingLevel,
        libraryId
      })
    ) as Job;
    job = snapshot;
    preset.value = snapshot.preset;
    targetLibraryId.value = libraryId;
    execute();
  }
  return {
    status,
    result,
    preset,
    targetLibraryId,
    error,
    liveOutput,
    activity,
    entries,
    isBusy,
    canRetry,
    clear,
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
      log("正在停止");
      try {
        await task.stop();
      } catch (cause: unknown) {
        status.value = "running";
        error.value =
          cause instanceof Error ? cause.message : "停止失败，请重试。";
        log(error.value, undefined, "error");
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
