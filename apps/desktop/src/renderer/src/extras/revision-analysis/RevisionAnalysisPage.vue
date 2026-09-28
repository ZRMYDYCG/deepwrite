<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  REVISION_TEXT_LIMIT,
  REVISION_REASON_LIMIT,
  REVISION_METHOD_LIMIT,
  type ModelConfig,
  type CatalogSnapshot
} from "@deepwrite/contracts/renderer";
import PopupSelect from "../../components/PopupSelect.vue";
import AnalysisProcessPanel from "../long-book-analysis/AnalysisProcessPanel.vue";
import { analysisThinkingOptions } from "../long-book-analysis/task-options";
import { uiMessage } from "../../ui-feedback";
import RevisionDiffList from "./RevisionDiffList.vue";
import RevisionResultPanel from "./RevisionResultPanel.vue";
import type { RevisionAnalysisController } from "./useRevisionAnalysis";
import "./revision-analysis.css";
const props = defineProps<{
  controller: RevisionAnalysisController;
  models: readonly ModelConfig[];
  catalogSnapshot: CatalogSnapshot | null;
}>();
const emit = defineEmits<{ refreshCatalog: [] }>();
const c = props.controller;
const processOpen = ref(false);
const model = computed(
  () => props.models.find((m) => m.id === c.selectedModelId.value) ?? null
);
async function act(action: () => unknown | Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    uiMessage.error(error instanceof Error ? error.message : "操作失败。");
  }
}
function pasteDocument(event: ClipboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  const pasted = event.clipboardData?.getData("text/plain");
  if (pasted === undefined) return;
  const length =
    target.value.length -
    (target.selectionEnd - target.selectionStart) +
    pasted.length;
  if (length > REVISION_TEXT_LIMIT) {
    event.preventDefault();
    uiMessage.error(
      "每侧正文最多 100,000 字符。请缩短后重新粘贴；本次粘贴未修改正文。"
    );
  }
}
function compare() {
  void act(() => {
    c.compare();
    if (!c.changes.value.length) uiMessage.info("未发现正文段落差异。");
  });
}
function start() {
  void act(async () => {
    await c.start();
    processOpen.value = true;
  });
}
function updateReason(id: string, reason: string) {
  if (c.disabled.value || !c.comparisonCurrent.value) return;
  const change = c.changes.value.find((c) => c.id === id);
  if (change) change.reason = reason;
}
onMounted(() => {
  void act(c.loadSettings);
});
</script>
<template>
  <div class="revision-analysis-page">
    <header class="analysis-page-header">
      <div>
        <p class="analysis-eyebrow">更多功能</p>
        <h1>修改分析</h1>
        <p>从修改前后文稿中学习你的修改方向，沉淀为可复用技能。</p>
      </div>
      <span v-if="c.isBusy.value">后台分析中</span>
    </header>
    <div class="revision-content">
      <section class="revision-inputs">
        <label class="analysis-setup-panel"
          >修改前
          <small
            >{{ c.beforeText.value.length.toLocaleString() }} / 100,000</small
          ><textarea
            v-model="c.beforeText.value"
            :maxlength="REVISION_TEXT_LIMIT"
            :disabled="c.disabled.value"
            placeholder="粘贴修改前的完整正文…"
            aria-label="修改前正文"
            @paste="pasteDocument"
            spellcheck="false"
          />
        </label>
        <label class="analysis-setup-panel"
          >修改后
          <small
            >{{ c.afterText.value.length.toLocaleString() }} / 100,000</small
          ><textarea
            v-model="c.afterText.value"
            :maxlength="REVISION_TEXT_LIMIT"
            :disabled="c.disabled.value"
            placeholder="粘贴修改后的完整正文…"
            aria-label="修改后正文"
            @paste="pasteDocument"
            spellcheck="false"
          />
        </label>
      </section>
      <section class="analysis-setup-panel">
        <div class="revision-controls">
          <button
            class="revision-text-button"
            :disabled="
              c.disabled.value ||
              !c.beforeText.value.trim() ||
              !c.afterText.value.trim()
            "
            @click="compare"
          >
            比较差异
          </button>
          <button
            v-if="!c.isBusy.value"
            class="analysis-primary-button"
            :disabled="!c.canStart.value || c.saving.value"
            @click="start"
          >
            {{ c.result.value ? "重新分析" : "开始分析" }}
          </button>
          <button
            v-else
            class="revision-text-button"
            :disabled="c.status.value === 'stopping'"
            @click="act(c.stop)"
          >
            {{ c.status.value === "stopping" ? "正在停止…" : "停止分析" }}
          </button>
          <label
            >分析模型<PopupSelect
              v-model="c.selectedModelId.value"
              :options="models.map((m) => ({ value: m.id, label: m.label }))"
              :disabled="c.disabled.value"
              accessible-label="修改分析模型"
              placeholder="请选择模型"
          /></label>
          <label
            >思考等级<PopupSelect
              v-model="c.selectedThinkingLevel.value"
              :options="analysisThinkingOptions(model)"
              :disabled="c.disabled.value || !model"
              accessible-label="修改分析思考等级"
          /></label>
        </div>
        <details class="revision-method">
          <summary>修改分析智能体 · 分析方法</summary>
          <label
            >智能体提示词<textarea
              v-model="c.systemPrompt.value"
              :maxlength="REVISION_METHOD_LIMIT"
              :disabled="c.disabled.value"
            />
          </label>
          <div class="revision-controls">
            <button
              class="revision-text-button"
              :disabled="c.disabled.value"
              @click="
                act(async () => {
                  await c.saveSettings();
                  uiMessage.success('分析方法已保存。');
                })
              "
            >
              保存分析方法</button
            ><button
              class="revision-text-button"
              :disabled="c.disabled.value"
              @click="
                act(async () => {
                  await c.saveSettings(true);
                  uiMessage.success('已恢复默认分析方法。');
                })
              "
            >
              恢复默认
            </button>
          </div>
        </details>
      </section>
      <section class="analysis-setup-panel">
        <label>
          <span>总体修改说明 <small>选填</small></span>
          <textarea
            v-model="c.overallReason.value"
            :maxlength="REVISION_REASON_LIMIT"
            :disabled="c.disabled.value"
            placeholder="这次修改整体上希望达到什么效果？留空也可以开始分析。"
          />
        </label>
      </section>
      <RevisionDiffList
        :changes="c.changes.value"
        :disabled="c.disabled.value"
        :current="c.comparisonCurrent.value"
        @reason="updateReason"
      />
      <section v-if="c.status.value !== 'idle'" class="analysis-setup-panel">
        <div class="revision-controls">
          <strong>{{ c.activity.value }}</strong
          ><button
            class="revision-text-button"
            @click="processOpen = !processOpen"
          >
            {{ processOpen ? "收起执行过程" : "查看执行过程" }}</button
          ><button
            v-if="c.canRetry.value"
            class="revision-text-button"
            :disabled="c.disabled.value || c.saving.value"
            @click="act(c.retry)"
          >
            重试上次任务
          </button>
        </div>
        <AnalysisProcessPanel
          v-if="processOpen"
          accessible-label="修改分析执行过程"
          :entries="c.entries.value"
          :current-activity="c.activity.value"
          :live-output="c.liveOutput.value"
          :error="null"
          footer-text="完整前后文稿与全部差异联合分析；内部思考文本不会展示。"
        />
      </section>
      <RevisionResultPanel
        :controller="c"
        :catalog-snapshot="catalogSnapshot"
        @refresh-catalog="emit('refreshCatalog')"
      />
    </div>
  </div>
</template>
