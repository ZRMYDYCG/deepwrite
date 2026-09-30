import "./analysis-probe-i18n";
import { createApp, h, nextTick, ref, shallowRef } from "vue";
import {
  createEnvelope,
  type CatalogSnapshot,
  type DeepWriteApi,
  type ExtrasAgentRunRequest,
  type LongBookAnalysisPreset,
  type LongBookAnalysisResult,
  type LongBookAnalysisSource,
  type ModelConfig,
  type SystemEventEnvelope
} from "@deepwrite/contracts/renderer";
import LongBookAnalysisPage from "../../src/renderer/src/extras/long-book-analysis/LongBookAnalysisPage.vue";
import AnalysisResultPanel from "../../src/renderer/src/extras/long-book-analysis/AnalysisResultPanel.vue";
import { useLongBookAnalysis } from "../../src/renderer/src/extras/long-book-analysis/useLongBookAnalysis";
import {
  applyAppearanceThemeToDocument,
  defaultAppearanceTheme
} from "../../src/renderer/src/composables/appearanceThemeRuntime";
import "../../src/renderer/src/styles.css";

document.body.style.minWidth = "0";
document.body.style.margin = "0";
const model = {
  id: "long-probe-model",
  label: "长篇验证模型",
  provider: "custom",
  modelId: "invalid-probe-model",
  api: "openai-completions",
  baseUrl: "https://provider.example.test/v1",
  reasoning: false,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["off"],
  contextWindow: 100000,
  maxTokens: 16000
} as ModelConfig;
const preset: LongBookAnalysisPreset = {
  id: "probe-plot",
  name: "剧情结构",
  description: "提炼章节中的冲突、人物选择与转折。",
  systemPrompt: "依据章节证据分析剧情。",
  output: { domain: "material", kind: "plot", stageId: "pacing" }
};
const presets: LongBookAnalysisPreset[] = [
  preset,
  {
    id: "probe-character",
    name: "人物",
    description: "拆解人物目标、关系、功能、选择和阶段性弧光。",
    systemPrompt: "依据章节证据分析人物。",
    output: { domain: "material", kind: "character", stageId: "character" }
  },
  {
    id: "probe-style",
    name: "文风",
    description: "提炼可直接交给分节写手执行的行文规则与检查清单。",
    systemPrompt: "依据章节证据提炼文风。",
    output: { domain: "skill", kind: "style", stageId: "expert_section_writer" }
  }
];
const pageCatalog = {
  materials: [
    {
      id: "probe-mixed",
      title: "验证素材库",
      materialKind: "mixed",
      projectRevision: 3
    }
  ],
  skills: [
    {
      id: "probe-skill",
      title: "验证技能库",
      skillKind: "style",
      isBuiltin: false,
      projectRevision: 5
    }
  ]
} as unknown as CatalogSnapshot;
const savedEntries: {
  domain: string;
  libraryId: string;
  baseProjectRevision?: number;
}[] = [];
const source: LongBookAnalysisSource = {
  id: "long-probe-source",
  kind: "txt",
  name: "雨夜归途 · 验证长篇",
  diagnostics: [],
  chapters: ["来信", "归途", "重逢"].map((title, index) => {
    const text = `第${index + 1}章 ${title}\n雨停了，她收好来信，踏上回乡的路。`;
    return {
      id: `chapter-${index + 1}`,
      order: index + 1,
      title,
      text,
      charCount: text.length,
      sourceName: "验证长篇.txt"
    };
  })
};
const runtime = { provider: "test", model: "probe", mode: "provider" };
let request: ExtrasAgentRunRequest | undefined;
const requests: { request: ExtrasAgentRunRequest; runId: string }[] = [];
let runCount = 0;
let abortCount = 0;
let imported = false;
const api = {
  catalog: {
    createLibraryEntry: async (input: (typeof savedEntries)[number]) => {
      savedEntries.push(input);
      return {};
    }
  },
  extrasAgents: {
    run: async (input: ExtrasAgentRunRequest) => {
      request = input;
      runCount++;
      requests.push({ request: input, runId: `long-probe-${runCount}` });
      return {
        sessionId: input.sessionId,
        runId: `long-probe-${runCount}`,
        acceptedAt: new Date().toISOString(),
        runtime
      };
    },
    profiles: {
      list: async () => ({ agentId: "long-book-analysis", profiles: presets })
    }
  },
  longBookAnalysis: {
    chooseSource: async () => {
      imported = true;
      return source;
    },
    sources: {
      list: async () => ({
        sources: imported
          ? [
              {
                id: source.id,
                kind: source.kind,
                name: source.name,
                chapterCount: 3,
                characterCount: source.chapters.reduce(
                  (total, chapter) => total + chapter.charCount,
                  0
                ),
                importedAt: "2026-01-01T00:00:00.000Z"
              }
            ]
          : []
      }),
      load: async () => source
    }
  },
  session: {
    abort: async () => {
      abortCount++;
      return {
        sessionId: request?.sessionId,
        runId: `long-probe-${runCount}`,
        abortedAt: new Date().toISOString()
      };
    }
  }
} as unknown as DeepWriteApi;
const c = useLongBookAnalysis({ api: () => api });
c.setConfiguredModels([model]);
createApp({
  render: () =>
    h(LongBookAnalysisPage, {
      controller: c,
      models: [model],
      catalogSnapshot: pageCatalog
    })
}).mount("#app");
const frame = async () => {
  await nextTick();
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
};
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  check(found, `缺少元素：${selector}`);
  return found;
}
function button(text: string): HTMLButtonElement {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>("button")
  ].find((candidate) => candidate.textContent?.trim() === text);
  check(found && !found.disabled, `缺少可用按钮：${text}`);
  return found;
}
function emit(
  type: string,
  payload: Record<string, unknown>,
  target = requests.at(-1)
): void {
  check(target, "必须先通过开始按钮提交任务");
  c.handleEvent(
    createEnvelope(
      type,
      {
        sessionId: target.request.sessionId,
        runId: target.runId,
        messageId: "long-probe-message",
        runtime,
        ...payload
      },
      { id: `long-probe-event-${Date.now()}` }
    ) as SystemEventEnvelope
  );
}
async function verifyResultTargets(): Promise<void> {
  const host = document.createElement("div");
  host.className = "analysis-workbench";
  Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "1" });
  document.body.append(host);
  const result = ref<LongBookAnalysisResult>({
    name: "目标库验证",
    description: "验证完成结果的保存目标",
    content: "第一份结果"
  });
  const completedPreset = shallowRef({ ...preset });
  const libraries = [
    {
      id: "library-a",
      title: "验证素材库 A",
      materialKind: "plot",
      projectRevision: 1
    },
    {
      id: "library-b",
      title: "验证素材库 B",
      materialKind: "plot",
      projectRevision: 1
    }
  ];
  const catalog = shallowRef({
    materials: libraries,
    skills: []
  } as unknown as CatalogSnapshot);
  const saved: { libraryId: string; baseProjectRevision?: number }[] = [];
  const app = createApp({
    render: () =>
      h(AnalysisResultPanel, {
        result: result.value,
        preset: completedPreset.value,
        catalogSnapshot: catalog.value,
        saving: false,
        onUpdate: (value: LongBookAnalysisResult) => {
          result.value = value;
        },
        onSave: (value: {
          libraryId: string;
          baseProjectRevision?: number;
        }) => {
          saved.push(value);
        }
      })
  });
  app.mount(host);
  const save = async () => {
    const control = host.querySelector<HTMLButtonElement>(
      ".result-save-row > .analysis-primary-button"
    );
    check(control && !control.disabled, "结果应允许保存到所选目标库");
    control.click();
    await frame();
    return saved.at(-1)!;
  };
  const saveDisabled = () =>
    host.querySelector<HTMLButtonElement>(
      ".result-save-row > .analysis-primary-button"
    )!.disabled;
  const selectLibrary = async (title: string) => {
    host
      .querySelector<HTMLButtonElement>(
        ".result-target-library .popup-select-trigger"
      )!
      .click();
    await frame();
    const option = [
      ...document.querySelectorAll<HTMLButtonElement>(".popup-select-option")
    ].find((candidate) => candidate.textContent?.includes(title));
    check(option, `可以手动选择${title}`);
    option.click();
    await frame();
  };
  try {
    await frame();
    check(saveDisabled(), "第一份结果生成后必须先明确选择库才能保存");
    await selectLibrary("验证素材库 A");
    check((await save()).libraryId === "library-a", "第一份结果保存到手选库 A");
    completedPreset.value = { ...preset };
    result.value = { ...result.value, content: "第二份结果" };
    await frame();
    check(saveDisabled(), "新完成结果不能沿用上次的保存目标");
    await selectLibrary("验证素材库 B");
    check(
      (await save()).libraryId === "library-b",
      "新结果使用生成后手选的库 B"
    );
    await selectLibrary("验证素材库 A");
    catalog.value = {
      materials: libraries.map((library) => ({
        ...library,
        projectRevision: 2
      })),
      skills: []
    } as unknown as CatalogSnapshot;
    await frame();
    const refreshed = await save();
    check(
      refreshed.libraryId === "library-a" &&
        refreshed.baseProjectRevision === 2,
      "同一结果刷新目录应保留手选目标并使用最新版本"
    );
    host
      .querySelector<HTMLButtonElement>(".analysis-card-heading button")!
      .click();
    await frame();
    const body = host.querySelector<HTMLTextAreaElement>(".result-body")!;
    body.value = "用户编辑后的第二份结果";
    body.dispatchEvent(new Event("input", { bubbles: true }));
    await frame();
    check(
      (await save()).libraryId === "library-a",
      "编辑同一结果不能重置手选目标库"
    );
    completedPreset.value = { ...preset };
    result.value = { ...result.value, content: "第三份结果" };
    await frame();
    check(saveDisabled(), "相同预设 ID 的新完成结果也必须重新明确选择目标");
    await selectLibrary("验证素材库 B");
    check((await save()).libraryId === "library-b", "手选后可以保存新结果");
    catalog.value = {
      materials: libraries.filter((library) => library.id === "library-a"),
      skills: []
    } as unknown as CatalogSnapshot;
    await frame();
    check(saveDisabled(), "已选库不可用后不能自动改选其它库");
  } finally {
    app.unmount();
    host.remove();
  }
}
async function until(predicate: () => boolean, message: string) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 3000) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await frame();
}
function option(text: string): HTMLButtonElement {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>(".popup-select-option")
  ].find(
    (candidate) =>
      candidate
        .querySelector(".popup-select-option-copy > span")
        ?.textContent?.trim() === text
  );
  check(found, `缺少选项：${text}`);
  return found;
}
async function completeRun(target: (typeof requests)[number], name: string) {
  const input = target.request.task.input as { phase: string; unitId: string };
  const output =
    input.phase === "final"
      ? {
          kind: "book-analysis-result",
          unitId: input.unitId,
          result: {
            name,
            description: "用于验证并行拆书结果。",
            content: `# ${name}\n\n三章中的冲突逐步收紧，人物在归途中做出选择。`
          }
        }
      : {
          kind: "book-analysis-note",
          unitId: input.unitId,
          note: { text: `${name}的章节笔记。` }
        };
  emit(
    "extras_agent.output_updated",
    {
      agentId: "long-book-analysis",
      jobId: (target.request.task.input as { jobId: string }).jobId,
      output
    },
    target
  );
  emit("agent.message_completed", { content: "完成。" }, target);
  await frame();
}
async function verifyParallelPresets() {
  element<HTMLButtonElement>(
    '[role="combobox"][aria-label="拆书预设"]'
  ).click();
  await frame();
  option("人物").click();
  await frame();
  option("文风").click();
  await frame();
  check(document.querySelector(".popup-select-menu"), "多选菜单勾选后保持打开");
  document
    .querySelector(".popup-select-menu")!
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
  await frame();
  check(
    document.querySelectorAll(".preset-task-row").length === 3,
    "已选预设列表显示三个预设"
  );
  const before = requests.length;
  button("开始分析 · 3 项").click();
  await until(() => requests.length === before + 3, "三个预设应同时提交");
  const batchRuns = requests.slice(before);
  check(
    batchRuns.length === 3 &&
      new Set(batchRuns.map((item) => item.request.task.profileId)).size === 3,
    "三个预设同时发起独立分析"
  );
  check(
    element(".analysis-status-trigger").textContent?.includes("3 个运行"),
    "汇总状态显示运行数量"
  );
  for (const [index, target] of batchRuns.entries())
    await completeRun(target, `结果 ${index + 1}`);
  await until(() => requests.length === before + 6, "每个预设应进入最终阶段");
  const finals = requests.slice(before + 3);
  check(finals.length === 3, "每个预设进入自己的最终阶段");
  const names = new Map([
    ["probe-plot", "剧情结构结果"],
    ["probe-character", "人物结果"],
    ["probe-style", "文风规则"]
  ]);
  for (const target of finals)
    await completeRun(target, names.get(target.request.task.profileId)!);
  await until(() => c.status.value === "completed", "三个预设全部完成");
  const tabs = [
    ...document.querySelectorAll<HTMLButtonElement>(".analysis-result-tab")
  ];
  check(tabs.length === 3, "结果卡为每个预设显示一个标签");
  element<HTMLButtonElement>(
    ".result-target-library .popup-select-trigger"
  ).click();
  await frame();
  option("验证素材库").click();
  await frame();
  tabs[1]!.click();
  await frame();
  check(
    element(".result-target-library").textContent?.includes("验证素材库"),
    "同类结果自动沿用已选目标库"
  );
  tabs[2]!.click();
  await frame();
  element<HTMLButtonElement>(
    ".result-target-library .popup-select-trigger"
  ).click();
  await frame();
  option("验证技能库").click();
  await frame();
  button("全部写入 (3)").click();
  await until(() => savedEntries.length === 3, "全部写入应创建三条条目");
  check(
    savedEntries.length === 3 &&
      savedEntries.map((entry) => entry.baseProjectRevision).join() ===
        "3,4,5" &&
      savedEntries[2]!.domain === "skill",
    "全部写入按顺序使用各库递增版本"
  );
  check(
    [...document.querySelectorAll(".analysis-result-tab small")].every(
      (badge) => badge.textContent?.includes("已写入")
    ),
    "写入后标签显示已写入"
  );
  return { parallelPresets: 3, savedAll: savedEntries.length };
}
async function run() {
  await frame();
  check(
    !document.querySelector(".analysis-settings"),
    "正文区域不再展示开始前的额外设置"
  );
  const modelTrigger = element<HTMLButtonElement>(".analysis-model-trigger");
  check(
    modelTrigger.closest(".analysis-page-header"),
    "模型设置必须位于右上角页面工具栏"
  );
  modelTrigger.click();
  await frame();
  check(
    document.querySelector(".analysis-model-panel"),
    "右上角可展开模型设置"
  );
  check(
    !document.querySelector('[aria-label="目标资料库"]'),
    "运行前不显示预选资料库"
  );
  modelTrigger.click();
  await frame();
  button("导入 TXT").click();
  await frame();
  check(c.source.value?.chapters.length === 3, "真实导入按钮应导入三章来源");
  check(
    element<HTMLInputElement>('[aria-label="起始章节"]').value === "1" &&
      element<HTMLInputElement>('[aria-label="结束章节"]').value === "3",
    "导入后自动选择有效章节范围"
  );
  check(!document.querySelector(".chapter-editor"), "章节校正默认折叠");
  button("查看与校正").click();
  await frame();
  check(document.querySelector(".chapter-editor"), "点击后才展开章节校正");
  button("收起正文").click();
  button("开始分析").click();
  await frame();
  check(
    c.isBusy.value && request?.task.agentId === "long-book-analysis",
    "开始按钮应进入真实长篇pipeline"
  );
  check(
    request.task.input.phase === "batch" &&
      request.task.input.selectionStart === 1 &&
      request.task.input.selectionEnd === 3,
    "请求须保留默认三章范围"
  );
  const jobId = request.task.input.jobId;
  check(
    c.batch.items.value[0]?.runner.progressText?.value.includes("处理步骤 0/2"),
    "进度应显示真实已完成与估计步骤数"
  );
  check(!document.querySelector(":popover-open"), "运行时默认收起过程");
  const trigger = element<HTMLButtonElement>(".analysis-status-trigger");
  trigger.click();
  await frame();
  const drawer = element(".analysis-process-drawer:popover-open");
  emit("tool.call_requested", { toolName: "read_analysis_input" });
  emit("agent.thinking_delta", {
    delta: "PROBE_PRIVATE_REASONING_DO_NOT_RENDER"
  });
  emit("agent.message_delta", {
    delta: "正在核对三章中的人物选择与冲突线索。"
  });
  await frame();
  check(
    drawer.textContent?.includes("正在读取章节或分析笔记"),
    "过程展示真实工具动作"
  );
  check(drawer.textContent?.includes("正在核对三章"), "过程展示公开输出");
  check(
    !document.body.textContent?.includes(
      "PROBE_PRIVATE_REASONING_DO_NOT_RENDER"
    ),
    "过程不泄露内部思考"
  );
  element<HTMLButtonElement>('[aria-label="关闭执行过程"]').click();
  await frame();
  check(
    c.isBusy.value && abortCount === 0 && document.activeElement === trigger,
    "关闭抽屉应继续任务并恢复焦点"
  );
  button("停止").click();
  await frame();
  check(
    c.status.value === "stopped" && c.batch.canRetry.value && abortCount === 1,
    "停止后应保留续跑步骤"
  );
  button("继续未完成阶段").click();
  await frame();
  check(
    c.isBusy.value && runCount === 2 && request.task.input.jobId === jobId,
    "继续按钮必须沿用原任务检查点"
  );
  button("停止").click();
  await frame();
  await verifyResultTargets();
  const parallel = await verifyParallelPresets();
  return {
    ...parallel,
    importedChapters: 3,
    range: [1, 3],
    sourceCollapsed: true,
    modelSettingsInHeader: true,
    noPreanalysisDestination: true,
    processOpened: true,
    closePreservedRun: true,
    checkpointResumed: true,
    explicitResultDestination: true,
    resultTargetReset: true,
    manualTargetPreserved: true,
    submittedRuns: runCount,
    abortCount
  };
}
async function show(scheme: "light" | "dark", size: number, process: boolean) {
  applyAppearanceThemeToDocument({
    scheme,
    theme: {
      ...defaultAppearanceTheme(scheme),
      uiFontSize: size,
      accent: "#8a4bc2"
    },
    uiFontFamily: "system",
    editorFontFamily: "song"
  });
  if (document.querySelector(".analysis-process-drawer:popover-open"))
    element<HTMLButtonElement>('[aria-label="关闭执行过程"]').click();
  await frame();
  const page = element(".long-book-analysis-page");
  page.scrollTop = 0;
  if (process) {
    element<HTMLButtonElement>(".analysis-status-trigger").click();
    await frame();
    const drawer = element(".analysis-process-drawer:popover-open");
    check(drawer.scrollWidth <= drawer.clientWidth + 1, "过程抽屉不能横向溢出");
  }
  await frame();
  check(page.scrollWidth <= page.clientWidth + 1, "长篇页面不能横向溢出");
  return {
    scheme,
    size,
    process,
    scrollWidth: page.scrollWidth,
    clientWidth: page.clientWidth
  };
}
Object.assign(window, {
  runLongAnalysisProbe: run,
  showLongAnalysisProbe: show
});
