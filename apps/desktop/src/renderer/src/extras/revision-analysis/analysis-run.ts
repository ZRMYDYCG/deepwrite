import { computed, ref } from "vue";
import { createId } from "@deepwrite/shared";
import {
  RevisionAnalysisRuntimeContextSchema,
  assertExtrasAgentBudget,
  type DeepWriteApi,
  type ModelConfig,
  type RevisionAnalysisInput,
  type RevisionAnalysisProfile,
  type RevisionAnalysisResult,
  type SystemEventEnvelope,
  type ThinkingLevel
} from "@deepwrite/contracts/renderer";
import {
  startExtrasAgentTask,
  type ExtrasAgentTaskHandle
} from "../agent-runtime/extrasAgentTask";

interface Job {
  input: ReturnType<typeof RevisionAnalysisRuntimeContextSchema.parse>;
  profile: RevisionAnalysisProfile;
  model: ModelConfig;
  thinkingLevel: ThinkingLevel;
}

/** Identifies the input and method a result was produced from. */
export function revisionAnalysisInputKey(
  input: RevisionAnalysisInput,
  systemPrompt: string
): string {
  return JSON.stringify({ ...input, systemPrompt });
}

export function createRevisionAnalysisRun(api: () => DeepWriteApi) {
  const status = ref<
    "idle" | "running" | "stopping" | "stopped" | "error" | "completed"
  >("idle");
  const completedInput = ref("");
  const result = ref<RevisionAnalysisResult | null>(null);
  const error = ref<string | null>(null);
  const liveOutput = ref("");
  const activity = ref("等待开始");
  const entries = ref<string[]>([]);
  const isBusy = computed(
    () => status.value === "running" || status.value === "stopping"
  );
  const canRetry = computed(
    () => status.value === "stopped" || status.value === "error"
  );
  let job: Job | null = null;
  let task: ExtrasAgentTaskHandle | null = null;
  let disposed = false;
  function log(message: string) {
    activity.value = message;
    entries.value.push(message);
  }
  function clear() {
    if (isBusy.value) throw new Error("分析运行中，不能修改输入。");
    job = null;
    result.value = null;
    status.value = "idle";
    error.value = null;
    entries.value = [];
    liveOutput.value = "";
    activity.value = "等待开始";
  }
  function fail(cause: unknown) {
    status.value = "error";
    error.value = cause instanceof Error ? cause.message : "修改分析失败。";
    log(error.value);
  }
  function execute() {
    if (!job || disposed) return;
    const current = job;
    assertExtrasAgentBudget(
      {
        agentId: "revision-analysis",
        profile: current.profile,
        input: current.input
      },
      current.model
    );
    status.value = "running";
    error.value = null;
    liveOutput.value = "";
    entries.value = [];
    log(`正在学习 ${current.input.changes.length} 组修改`);
    let draft: RevisionAnalysisResult | undefined;
    const running = startExtrasAgentTask(
      api(),
      {
        modelId: current.model.id,
        thinkingLevel: current.thinkingLevel,
        task: {
          agentId: "revision-analysis",
          profileId: current.profile.id,
          input: current.input
        }
      },
      {
        onDelta(delta) {
          liveOutput.value = (liveOutput.value + delta).slice(-200000);
        },
        onThinking() {
          activity.value = "模型正在思考";
        },
        onToolRequested() {
          log("正在新建技能草稿");
        },
        onOutput(output) {
          if (output.kind !== "revision-analysis-result") return;
          draft = {
            ...output.result,
            report: output.result.report || liveOutput.value.trim()
          };
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
        if (!draft) {
          fail(new Error("模型未调用工具新建技能草稿，请重试上次任务。"));
          return;
        }
        result.value = {
          ...draft,
          report:
            draft.report ||
            (outcome.content || liveOutput.value).trim().slice(0, 200000)
        };
        const { jobId, ...input } = current.input;
        void jobId;
        completedInput.value = revisionAnalysisInputKey(
          input,
          current.profile.systemPrompt
        );
        status.value = "completed";
        log("分析完成，结果可编辑并保存");
      },
      (cause: unknown) => {
        if (task !== running) return;
        task = null;
        fail(cause);
      }
    );
  }
  function start(
    input: RevisionAnalysisInput,
    profile: RevisionAnalysisProfile,
    model: ModelConfig,
    thinkingLevel: ThinkingLevel
  ) {
    if (isBusy.value || disposed) throw new Error("分析正在运行或已释放。");
    if (
      thinkingLevel !== "off" &&
      !model.thinkingLevelOptions.includes(thinkingLevel)
    )
      throw new Error("请选择当前模型支持的思考等级。");
    const context = RevisionAnalysisRuntimeContextSchema.parse({
      ...input,
      jobId: createId("revision_analysis_job")
    });
    assertExtrasAgentBudget(
      { agentId: "revision-analysis", profile, input: context },
      model
    );
    job = JSON.parse(
      JSON.stringify({ input: context, profile, model, thinkingLevel })
    ) as Job;
    execute();
  }
  return {
    completedInput,
    status,
    result,
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
        log(error.value);
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
