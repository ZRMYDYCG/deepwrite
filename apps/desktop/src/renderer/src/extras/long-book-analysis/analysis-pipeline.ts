import type { ShallowRef } from "vue";
import {
  LONG_BOOK_ANALYSIS_MAX_SELECTED_CHAPTERS,
  type DeepWriteApi,
  type LongBookAnalysisPreset,
  type LongBookAnalysisResult,
  type LongBookAnalysisRuntimeContext,
  type LongBookAnalysisSource,
  type ModelConfig,
  type SystemEventEnvelope
} from "@deepwrite/contracts/renderer";
import { createId } from "@deepwrite/shared";
import {
  buildAnalysisSegments,
  groupAnalysisSegments,
  resolveAnalysisInputBudget
} from "./batching";
import type { LongBookAnalysisStartInput } from "./useLongBookAnalysis";
import type {
  LongBookAnalysisJob as AnalysisJob,
  LongBookAnalysisPipelineState
} from "./analysis-pipeline-types";
import {
  analysisErrorMessage,
  createAnalysisNote
} from "./analysis-pipeline-helpers";
import {
  startExtrasAgentTask,
  type ExtrasAgentTaskHandle
} from "../agent-runtime/extrasAgentTask";
import { LongBookAnalysisProcessTracker } from "./analysis-process";
import { reduceAnalysisJob } from "./analysis-reducer";
export type { LongBookAnalysisPhase } from "./analysis-pipeline-types";

export class LongBookAnalysisPipeline {
  private job: AnalysisJob | null = null;
  private pending: ExtrasAgentTaskHandle | null = null;
  private stopRequested = false;
  private disposed = false;
  private readonly process: LongBookAnalysisProcessTracker;

  constructor(
    private readonly getApi: () => DeepWriteApi,
    private readonly models: ShallowRef<readonly ModelConfig[]>,
    private readonly state: LongBookAnalysisPipelineState
  ) {
    this.process = new LongBookAnalysisProcessTracker(state);
  }

  get hasJob(): boolean {
    return this.job !== null;
  }

  get preset(): LongBookAnalysisPreset | null {
    return this.job?.preset ?? null;
  }

  get targetLibraryId(): string {
    return this.job?.libraryId ?? "";
  }

  reset(): void {
    if (["running", "stopping"].includes(this.state.status.value)) {
      throw new Error("分析运行中，不能修改来源或预设。");
    }
    this.job = null;
    this.state.result.value = null;
    this.state.phase.value = null;
    this.state.completedUnits.value = 0;
    this.state.estimatedUnits.value = 0;
    this.state.status.value = "idle";
    this.state.error.value = null;
    this.process.reset();
  }

  start(
    source: LongBookAnalysisSource,
    preset: LongBookAnalysisPreset,
    input: LongBookAnalysisStartInput
  ): void {
    const modelId = input.modelId ?? "";
    const model = this.models.value.find((item) => item.id === modelId);
    if (!modelId || !model) throw new Error("请选择可用模型。");
    const thinkingLevel = input.thinkingLevel ?? model.defaultThinkingLevel;
    if (
      thinkingLevel !== "off" &&
      !model.thinkingLevelOptions.includes(thinkingLevel)
    ) {
      throw new Error("所选思考等级不在当前模型配置中，请重新选择。");
    }
    if (input.endOrder < input.startOrder) {
      throw new Error("结束章节不能早于起始章节。");
    }
    if (
      input.endOrder - input.startOrder + 1 >
      LONG_BOOK_ANALYSIS_MAX_SELECTED_CHAPTERS
    ) {
      throw new Error("单次最多分析连续 50 章。");
    }
    const chapters = source.chapters.filter(
      (chapter) =>
        chapter.order >= input.startOrder && chapter.order <= input.endOrder
    );
    if (chapters.length !== input.endOrder - input.startOrder + 1) {
      throw new Error("选择范围与当前章节列表不一致，请重新选择。");
    }
    const inputBudget = resolveAnalysisInputBudget(model, preset.systemPrompt);
    const batches = groupAnalysisSegments(
      buildAnalysisSegments(chapters, inputBudget),
      inputBudget
    );
    this.job = {
      id: createId("long_book_analysis_job"),
      sourceTitle: source.name,
      preset,
      modelId,
      thinkingLevel,
      libraryId: input.libraryId?.trim() ?? "",
      selectionStart: input.startOrder,
      selectionEnd: input.endOrder,
      inputBudget,
      batches,
      batchIndex: 0,
      notes: [],
      reductionRounds: 0
    };
    this.state.result.value = null;
    this.state.phase.value = "batch";
    this.state.completedUnits.value = 0;
    this.state.estimatedUnits.value = batches.length + 1;
    this.process.start(
      preset.name,
      input.startOrder,
      input.endOrder,
      batches.length
    );
    void this.run();
  }

  retry(): boolean {
    if (!this.job || !["error", "stopped"].includes(this.state.status.value)) {
      return false;
    }
    this.process.retry();
    void this.run();
    return true;
  }

  async stop(): Promise<boolean> {
    if (!["running", "stopping"].includes(this.state.status.value)) {
      return false;
    }
    this.stopRequested = true;
    this.state.status.value = "stopping";
    this.process.requestStop();
    if (this.pending) {
      await this.pending.stop();
    } else {
      this.state.status.value = "stopped";
      this.process.stopped();
    }
    return true;
  }

  handleEvent(event: SystemEventEnvelope): void {
    this.pending?.handleEvent(event);
  }

  dispose(): void {
    this.disposed = true;
    this.stopRequested = true;
    const pending = this.pending;
    this.pending = null;
    pending?.dispose();
  }

  private base(unitId: string) {
    if (!this.job) throw new Error("拆书任务尚未准备。");
    return {
      jobId: this.job.id,
      unitId,
      sourceTitle: this.job.sourceTitle,
      selectionStart: this.job.selectionStart,
      selectionEnd: this.job.selectionEnd
    };
  }

  private async runUnit(
    context: LongBookAnalysisRuntimeContext
  ): Promise<string | LongBookAnalysisResult> {
    const job = this.job;
    if (!job) throw new Error("拆书任务尚未准备。");
    let note: string | undefined;
    let result: LongBookAnalysisResult | undefined;
    const task = startExtrasAgentTask(
      this.getApi(),
      {
        modelId: job.modelId,
        thinkingLevel: job.thinkingLevel,
        task: {
          agentId: "long-book-analysis",
          profileId: job.preset.id,
          input: context
        }
      },
      {
        onThinking: () => this.process.thinking(),
        onDelta: (delta) => this.process.appendMessage(delta),
        onToolRequested: (toolName) => this.process.toolStarted(toolName),
        onToolCompleted: (toolName, isError) =>
          this.process.toolCompleted(toolName, isError),
        onOutput: (output) => {
          if (output.kind === "book-analysis-note") {
            note = output.note.text;
            this.process.noteWritten(note.length);
          } else if (output.kind === "book-analysis-result") {
            result = output.result;
            this.state.result.value = output.result;
            this.process.resultWritten(output.result.name);
          }
        }
      }
    );
    this.pending = task;
    if (this.stopRequested) void task.stop().catch(() => undefined);
    try {
      const outcome = await task.outcome.catch((cause: unknown) => {
        throw new Error(analysisErrorMessage(cause, "拆书分析阶段失败。"));
      });
      if (outcome.status === "stopped") throw new Error("拆书分析已停止。");
      this.process.completeMessage(outcome.content);
      if (context.phase === "final") {
        if (result) return result;
        throw new Error("模型未调用 write_analysis_result，请重试当前阶段。");
      }
      if (note) return note;
      throw new Error("模型未调用 write_analysis_note，请重试当前阶段。");
    } finally {
      if (this.pending === task) this.pending = null;
    }
  }

  private async run(): Promise<void> {
    const job = this.job;
    if (!job || this.disposed) return;
    this.state.status.value = "running";
    this.state.error.value = null;
    this.stopRequested = false;
    try {
      this.state.phase.value = "batch";
      while (job.batchIndex < job.batches.length) {
        const batch = job.batches[job.batchIndex]!;
        const start = Math.min(...batch.map((item) => item.chapterOrder));
        const end = Math.max(...batch.map((item) => item.chapterOrder));
        this.process.beginUnit(
          "batch",
          `第 ${start}-${end} 章 · 批次 ${job.batchIndex + 1}/${job.batches.length}`
        );
        const text = await this.runUnit({
          ...this.base(createId("analysis_batch")),
          phase: "batch",
          segments: batch
        });
        if (typeof text !== "string") {
          throw new Error("分批阶段未返回中间笔记。");
        }
        job.notes.push(
          createAnalysisNote(text, `第 ${start}-${end} 章批次笔记`, start, end)
        );
        job.batchIndex += 1;
        this.state.completedUnits.value += 1;
      }
      this.state.phase.value = "reduce";
      await reduceAnalysisJob(job, {
        run: (notes) =>
          this.runUnit({
            ...this.base(createId("analysis_reduce")),
            phase: "reduce",
            notes
          }),
        begin: (detail) => this.process.beginUnit("reduce", detail),
        addEstimatedUnits: (count) => {
          this.state.estimatedUnits.value += count;
        },
        completeUnit: () => {
          this.state.completedUnits.value += 1;
        }
      });
      this.state.phase.value = "final";
      this.state.estimatedUnits.value = Math.max(
        this.state.estimatedUnits.value,
        this.state.completedUnits.value + 1
      );
      this.process.beginUnit("final", "根据全部分析笔记生成 Markdown 结果");
      const finalResult = await this.runUnit({
        ...this.base(createId("analysis_final")),
        phase: "final",
        notes: job.notes
      });
      if (typeof finalResult === "string") {
        throw new Error("最终阶段未返回拆书结果。");
      }
      this.state.result.value = finalResult;
      this.state.completedUnits.value += 1;
      this.state.status.value = "completed";
      this.process.complete();
    } catch (cause: unknown) {
      if (this.stopRequested) {
        this.state.status.value = "stopped";
        this.process.stopped();
      } else {
        this.state.status.value = "error";
        this.state.error.value = analysisErrorMessage(
          cause,
          "长篇拆书分析失败。"
        );
        this.process.fail(this.state.error.value);
      }
    } finally {
      this.pending = null;
    }
  }
}
