import { createApp, h, nextTick, ref } from "vue";
import { RevisionAnalysisPage } from "../../src/renderer/src/components/lazyAppComponents";
import { useRevisionAnalysis } from "../../src/renderer/src/extras/revision-analysis/useRevisionAnalysis";
import {
  applyAppearanceThemeToDocument,
  defaultAppearanceTheme
} from "../../src/renderer/src/composables/appearanceThemeRuntime";
import {
  DEFAULT_REVISION_METHOD,
  type DeepWriteApi,
  type ModelConfig,
  type CatalogSnapshot,
  type ExtrasAgentRunRequest,
  type SystemEventEnvelope
} from "@deepwrite/contracts/renderer";
import "../../src/renderer/src/styles.css";
document.body.style.minWidth = "0";
document.body.style.margin = "0";
const model = {
  id: "model",
  label: "验证模型",
  provider: "test",
  modelId: "test",
  api: "openai-completions",
  baseUrl: "https://example.test",
  reasoning: false,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["off"],
  contextWindow: 200000,
  maxTokens: 16000
} as ModelConfig;
const library = {
  id: "library",
  title: "我的修改技能",
  skillKind: "general",
  skillType: "short",
  overview: "",
  isBuiltin: false,
  entries: [],
  projectRevision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
} as const;
let request: ExtrasAgentRunRequest | undefined;
const saved: unknown[] = [];
const methodSettings = {
  agentId: "revision-analysis",
  profiles: [
    {
      id: "default",
      name: "修改分析",
      description: "从修改前后的正文差异中提炼可复用的修改技能。",
      systemPrompt: DEFAULT_REVISION_METHOD,
      builtin: true
    }
  ]
};
const api = {
  extrasAgents: {
    run: async (input: ExtrasAgentRunRequest) => {
      request = input;
      return {
        sessionId: input.sessionId,
        runId: "probe-run",
        acceptedAt: new Date().toISOString(),
        runtime: { provider: "test", model: "test", mode: "provider" }
      };
    },
    profiles: {
      list: async () => methodSettings,
      save: async () => methodSettings,
      reset: async () => methodSettings
    }
  },
  session: { abort: async () => ({}) },
  catalog: {
    createLibraryEntry: async (input: unknown) => {
      saved.push(input);
      return {};
    }
  }
} as unknown as DeepWriteApi;
const c = useRevisionAnalysis({ api: () => api });
c.setConfiguredModels([model]);
const visible = ref(true);
const catalog = { skills: [library] } as unknown as CatalogSnapshot;
createApp({
  render: () =>
    visible.value
      ? h(RevisionAnalysisPage, {
          controller: c,
          models: [model],
          catalogSnapshot: catalog
        })
      : h("div", "其他页面，修改分析在后台继续")
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
function button(text: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button")
  ].find((b) => b.textContent?.trim() === text);
  check(button, `缺少按钮：${text}`);
  return button;
}
function fill(label: string, text: string) {
  const el = document.querySelector<HTMLTextAreaElement>(
    `[aria-label="${label}"]`
  );
  check(el, `缺少输入：${label}`);
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
function event(type: string, payload: Record<string, unknown> = {}) {
  check(request, "分析请求应存在");
  c.handleEvent({
    type,
    payload: { sessionId: request.sessionId, runId: "probe-run", ...payload }
  } as SystemEventEnvelope);
}
async function run() {
  const deadline = Date.now() + 15000;
  while (!document.querySelector('[aria-label="修改前正文"]')) {
    check(Date.now() < deadline, "懒加载页面超时");
    await frame();
  }
  await frame();
  await c.loadSettings();
  await frame();
  fill(
    "修改前正文",
    "雨落在窗上。\n她感到非常悲伤，因为那封信让她想起很久以前的事情。\n她把信收进抽屉。\n夜色深了。"
  );
  fill(
    "修改后正文",
    "雨敲着窗。\n她捏住信角，半晌没松手。\n她把信收进抽屉。\n夜色深了。\n抽屉没有关严。"
  );
  await frame();
  button("比较差异").click();
  await frame();
  check(c.changes.value.length === 2, "应有两组差异");
  fill("差异 1 的修改理由", "用动作代替解释，让情绪留白。");
  await frame();
  button("开始分析").click();
  await frame();
  await frame();
  check(c.isBusy.value && request, "点击开始应启动任务");
  check(
    request.task.agentId === "revision-analysis" &&
      request.task.input.changes[0]?.reason === "用动作代替解释，让情绪留白。",
    "理由必须传入任务快照"
  );
  visible.value = false;
  await frame();
  check(c.isBusy.value, "切页不应停止任务");
  event("agent.message_delta", {
    delta:
      "# 修改分析报告\n\n## 修改概览\n从直接解释情绪，转向可观察的动作与有余味的细节。\n\n## 差异 1\n用户明确希望用动作代替解释。修改后通过捏住信角表现情绪，同时压缩直述信息。\n\n## 差异 2\n新增未关严的抽屉。推断：为结尾保留悬念，具体意图尚未说明。\n\n## 修改方向\n优先寻找能承载情绪的动作；只在读者需要补足理解时保留解释。"
  });
  event("extras_agent.output_updated", {
    agentId: "revision-analysis",
    jobId: request.task.input.jobId,
    output: {
      kind: "revision-analysis-result",
      result: {
        report: "",
        title: "以动作承载情绪的修改方法",
        description: "用于修订情绪描写较直白的场景，以符合人物的动作承载情绪。",
        body: "# 以动作承载情绪\n\n## 适用场景\n情绪描写较直白的短篇场景。\n\n## 执行步骤\n1. 找出直接解释情绪的句子。\n2. 选择与当下处境一致的微动作。\n3. 删除动作已经表达的信息。\n\n## 检查清单\n- 动作是否符合人物？\n- 是否保留必要的因果线索？\n- 是否避免所有场景一律删解释？"
      }
    }
  });
  event("agent.message_completed");
  visible.value = true;
  await frame();
  check(c.result.value && !c.isStale.value, "返回页面应显示新结果");
  check(c.result.value.report.includes("差异 1"), "应保留工具调用前输出的报告");
  c.result.value.body += "\n- 保留用户补充的具体限制。";
  // Exercise actual PopupSelect and save button.
  const select = document.querySelector<HTMLButtonElement>(
    '[aria-label="修改分析目标技能库"]'
  );
  check(select, "技能库选择器应存在");
  select.click();
  await frame();
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]')
  ].find((el) => el.textContent?.includes("我的修改技能"));
  check(option, "技能库选项应存在");
  option.click();
  await frame();
  button("保存到技能库").click();
  await frame();
  check(saved.length === 1, "技能应保存一次");
  check(button("已保存此版技能").disabled, "重复保存应被禁用");
  return {
    differenceGroups: c.changes.value.length,
    backgroundCompleted: true,
    editedSkillSaved: saved.length,
    duplicateBlocked: true
  };
}
async function show(
  scheme: "light" | "dark",
  size: number,
  menu: boolean,
  state: string
) {
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
  await frame();
  const page = document.querySelector<HTMLElement>(".revision-analysis-page")!;
  page.scrollTop = 0;
  if (state === "results")
    document
      .querySelector(".revision-result")!
      .scrollIntoView({ block: "start" });
  if (menu) {
    document
      .querySelector(".revision-controls")!
      .scrollIntoView({ block: "start" });
    document
      .querySelector<HTMLButtonElement>('[aria-label="修改分析模型"]')!
      .click();
  }
  await frame();
  check(page.scrollWidth <= page.clientWidth + 1, "页面不能横向溢出");
  const clipped = [
    ...page.querySelectorAll<HTMLElement>("input, textarea")
  ].filter((el) => el.getBoundingClientRect().right > innerWidth + 1);
  check(clipped.length === 0, "输入框不能超出窗口");
  return {
    scheme,
    size,
    state,
    scrollWidth: page.scrollWidth,
    clientWidth: page.clientWidth
  };
}
Object.assign(window, {
  runRevisionAnalysisProbe: run,
  showRevisionAnalysisProbe: show
});
