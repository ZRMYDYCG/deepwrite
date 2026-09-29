import { afterEach, describe, expect, it } from "vitest";
import { computed, ref } from "vue";
import { locale, t } from "../../i18n";
import { analysisRunLabels } from "./analysis-process";
import { localizedMessage, localizedTextRef } from "./localized-text";
import { createStyleComparisonProcess } from "../style-comparison/process";
import { LongBookAnalysisProcessTracker } from "../long-book-analysis/analysis-process";
import type { LongBookAnalysisProcessEntry } from "../long-book-analysis/analysis-process";
import { analysisThinkingOptions } from "../long-book-analysis/task-options";
import { summarizeCloudBackupPreview } from "../cloud-backup/cloudBackupPreviewSummary";
import { presetLabel } from "./preset-labels";
import type { LongBookAnalysisPreset } from "@deepwrite/contracts/renderer";
import { projectTypeLabels } from "../../features/chat-assistant/chatAssistantProjectOptions";
import { formatError } from "../../i18n/errors";

afterEach(() => {
  locale.value = "zh-CN";
});

describe("extras language changes", () => {
  it("updates existing status and option computations in both directions", () => {
    const status = computed(() => analysisRunLabels.running);
    const options = computed(() => analysisThinkingOptions(null));
    const project = computed(() => projectTypeLabels.short);
    const preview = computed(() => summarizeCloudBackupPreview([]));
    expect(status.value).toBe("分析中");
    expect(options.value[0]?.label).toBe("关闭");
    expect(project.value).toBe("短篇");
    expect(preview.value.statuses[0]?.label).toBe("将新增");

    locale.value = "en-US";
    expect(status.value).toBe("Analyzing");
    expect(options.value[0]?.label).toBe("Off");
    expect(project.value).toBe("Short story");
    expect(preview.value.statuses[0]?.label).toBe("Will add");

    locale.value = "zh-CN";
    expect(status.value).toBe("分析中");
    expect(project.value).toBe("短篇");
  });

  it("relocalizes recorded activity without changing model output or user names", () => {
    const process = createStyleComparisonProcess();
    process.reset("用户自定义模型");
    process.callbacks.onDelta?.("模型生成的中文正文");
    process.record(
      localizedMessage("extras.styleComparison.comparisonComplete"),
      localizedMessage("extras.styleComparison.resultRetainedBelow"),
      "success"
    );
    const ids = process.entries.value.map((entry) => entry.id);
    locale.value = "en-US";
    expect(process.activity.value).toBe("Organizing key findings and scores…");
    expect(process.entries.value[0]?.title).toBe("Start style comparison");
    expect(process.entries.value[0]?.detail).toBe("用户自定义模型");
    expect(process.entries.value.at(-1)?.detail).toBe(
      "The result is retained in the reading area below"
    );
    expect(process.output.value).toBe("模型生成的中文正文");
    expect(process.entries.value.map((entry) => entry.id)).toEqual(ids);
  });

  it("keeps phase details reactive and snapshots interpolation values", () => {
    const state = {
      processEntries: ref<LongBookAnalysisProcessEntry[]>([]),
      currentActivity: localizedTextRef(),
      liveOutput: ref("")
    };
    const tracker = new LongBookAnalysisProcessTracker(state);
    const params = { start: 1, end: 3, batch: 1, total: 2 };
    tracker.beginUnit(
      "batch",
      localizedMessage("extras.longBookAnalysis.batchProgress", params)
    );
    params.batch = 2;
    locale.value = "en-US";
    expect(state.currentActivity.value).toBe("Extract in batches");
    expect(state.processEntries.value[0]?.detail).toBe(
      "Chapters 1–3 · Batch 1/2"
    );
    locale.value = "zh-CN";
    expect(state.processEntries.value[0]?.detail).toBe("第 1-3 章 · 批次 1/2");
  });

  it("relocalizes retained error messages and their activity log", () => {
    const process = createStyleComparisonProcess();
    const diagnostic = { code: "catalog.conflict", message: "原始诊断" };
    const message = () =>
      formatError(diagnostic, t("extras.styleComparison.comparisonFailed"));
    process.error.value = message;
    process.record(
      localizedMessage("extras.analysisUi.analysisFailed"),
      message,
      "error"
    );
    const chinese = process.error.value;
    locale.value = "en-US";
    expect(process.error.value).toContain("The local file changed");
    expect(process.entries.value[0]?.detail).toBe(process.error.value);
    expect(diagnostic.message).toBe("原始诊断");
    locale.value = "zh-CN";
    expect(process.error.value).toBe(chinese);
    process.reset("用户模型");
    expect(process.error.value).toBeNull();
  });

  it("translates untouched preset metadata while preserving edits and stored values", () => {
    const preset: LongBookAnalysisPreset = {
      id: "plot-structure",
      builtin: true,
      name: "剧情结构",
      description: "拆解大剧情发展、章节级小剧情节拍与可复用结构模板。",
      systemPrompt: "用户保留的中文提示词。",
      output: { domain: "material", kind: "plot", stageId: "pacing" }
    };
    const before = JSON.stringify(preset);
    const name = computed(() => presetLabel(preset));
    expect(name.value).toBe("剧情结构");
    locale.value = "en-US";
    expect(name.value).toBe("Plot structure");
    expect(presetLabel(preset, "description")).toContain("chapter-level beats");
    expect(JSON.stringify(preset)).toBe(before);
    expect(presetLabel({ ...preset, name: "我的剧情方法" })).toBe(
      "我的剧情方法"
    );
    expect(presetLabel({ ...preset, builtin: false })).toBe("剧情结构");
  });

  it("uses English plural forms and preserves names through interpolation", () => {
    locale.value = "en-US";
    expect(t("extras.analysisUi.recordCount", { count: 1 })).toBe("1 record");
    expect(t("extras.analysisUi.recordCount", { count: 2 })).toBe("2 records");
    expect(t("extras.chatAssistant.editCharacter", { name: "人物甲" })).toBe(
      "Edit character: 人物甲"
    );
  });
});
