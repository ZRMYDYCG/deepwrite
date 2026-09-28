<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  ShortBookAnalysisPresetSchema,
  type CatalogSnapshot,
  type LongBookAnalysisPreset,
  type ModelConfig
} from "@deepwrite/contracts/renderer";
import PopupSelect from "../../components/PopupSelect.vue";
import { uiMessage } from "../../ui-feedback";
import PresetManager from "../long-book-analysis/PresetManager.vue";
import AnalysisRunStatus from "../long-book-analysis/AnalysisRunStatus.vue";
import ShortAnalysisSourceControls from "./ShortAnalysisSourceControls.vue";
import AnalysisResultPanel from "../long-book-analysis/AnalysisResultPanel.vue";
import {
  analysisThinkingOptions,
  compatibleAnalysisLibraries,
  analysisOutputTypeLabel,
  analysisLibraryOption
} from "../long-book-analysis/task-options";
import ShortAnalysisSources from "./ShortAnalysisSources.vue";
import type { ShortBookAnalysisController } from "./useShortBookAnalysis";
import "../long-book-analysis/long-book-analysis.css";
import "./short-book-analysis.css";
const props = defineProps<{
  controller: ShortBookAnalysisController;
  models: readonly ModelConfig[];
  catalogSnapshot: CatalogSnapshot | null;
}>();
const emit = defineEmits<{ refreshCatalog: [] }>();
const c = props.controller;
const managerOpen = ref(false);
const saving = ref(false);
const resultAnchor = ref<HTMLElement | null>(null);
const model = computed(
  () => props.models.find((m) => m.id === c.selectedModelId.value) ?? null
);
const libraries = computed(() =>
  compatibleAnalysisLibraries(c.selectedPreset.value, props.catalogSnapshot)
);
const disabled = computed(() => c.isBusy.value || c.loading.value);
async function act(action: () => unknown) {
  try {
    await action();
  } catch (error) {
    uiMessage.warning(error instanceof Error ? error.message : "操作失败。");
  }
}
watch(
  () => c.selectedPreset.value,
  (preset) => {
    c.selectedLibraryId.value = preset?.output.libraryId ?? "";
    if (preset?.selectionMode === "single" && c.selectedIds.value.length > 1)
      uiMessage.warning("当前预设仅支持一本，请调整勾选；已选文本仍保留。");
  },
  { immediate: true }
);
watch(
  libraries,
  (next) => {
    if (!next.some((l) => l.id === c.selectedLibraryId.value))
      c.selectedLibraryId.value = "";
  },
  { immediate: true }
);
async function savePresets(next: LongBookAnalysisPreset[]) {
  saving.value = true;
  try {
    await c.savePresets(ShortBookAnalysisPresetSchema.array().parse(next));
    managerOpen.value = false;
    uiMessage.success("短篇拆书预设已保存。");
  } catch (error) {
    uiMessage.error(error instanceof Error ? error.message : "保存失败。");
  } finally {
    saving.value = false;
  }
}
async function saveResult(input: {
  libraryId: string;
  baseProjectRevision?: number;
}) {
  saving.value = true;
  try {
    await c.persistResult(input);
    emit("refreshCatalog");
    uiMessage.success("分析结果已保存到资料库。");
  } catch (error) {
    uiMessage.error(error instanceof Error ? error.message : "保存失败。");
  } finally {
    saving.value = false;
  }
}
onMounted(() => void act(() => c.loadPresets()));
</script>
<template>
  <div class="long-book-analysis-page short-book-analysis-page">
    <header class="analysis-page-header">
      <div class="analysis-page-intro">
        <p class="analysis-eyebrow">更多功能</p>
        <h1>短篇拆书分析</h1>
        <p>从完整短篇提炼剧情、人物与文风，支持最多 10 本联合分析。</p>
      </div>
      <ShortAnalysisSourceControls
        :controller="c"
        @manage-presets="managerOpen = true"
      />
    </header>
    <div class="analysis-content">
      <ShortAnalysisSources :controller="c" />
      <section class="analysis-card setup-card">
        <header class="analysis-card-heading">
          <div>
            <p class="analysis-eyebrow">选择范围与预设</p>
            <h2>配置本次拆书任务</h2>
          </div>
          <AnalysisRunStatus
            :status="c.status.value"
            :entries="c.entries.value"
            :current-activity="c.activity.value"
            :live-output="c.liveOutput.value"
            :error="c.error.value"
            title="短篇拆书运行详情"
          />
        </header>
        <div class="setup-grid">
          <div class="setup-field setup-range-field">
            <span class="setup-field-label"
              >书本范围 <small>由预设决定</small></span
            >
            <div class="short-selection-summary">
              {{
                c.selectedPreset.value?.selectionMode === "multiple"
                  ? "多本 · 1—10 本联合分析"
                  : "单本 · 选择 1 本"
              }}
            </div>
          </div>
          <label class="setup-field"
            ><span class="setup-field-label">拆书预设</span
            ><PopupSelect
              v-model="c.selectedPresetId.value"
              :options="
                c.presets.value.map((p) => ({
                  value: p.id,
                  label: p.name,
                  description:
                    p.selectionMode === 'single' ? '单本' : '多本 · 1—10 本'
                }))
              "
              accessible-label="拆书预设"
              :disabled="disabled"
          /></label>
          <label class="setup-field"
            ><span class="setup-field-label">分析模型</span
            ><PopupSelect
              v-model="c.selectedModelId.value"
              :options="models.map((m) => ({ value: m.id, label: m.label }))"
              accessible-label="分析模型"
              :disabled="disabled"
          /></label>
          <label class="setup-field"
            ><span class="setup-field-label">思考等级</span
            ><PopupSelect
              v-model="c.selectedThinkingLevel.value"
              :options="analysisThinkingOptions(model)"
              accessible-label="思考等级"
              :disabled="disabled || !model"
          /></label>
        </div>
        <div v-if="c.selectedPreset.value" class="preset-summary">
          <div class="preset-summary-main">
            <div class="preset-summary-copy">
              <strong>{{ c.selectedPreset.value.name }}</strong>
              <span>{{ c.selectedPreset.value.description }}</span>
            </div>
            <small
              >{{
                c.selectedPreset.value.output.domain === "material"
                  ? "素材条目"
                  : "技能条目"
              }}
              · {{ analysisOutputTypeLabel(c.selectedPreset.value) }}</small
            >
          </div>
          <label class="preset-target-field">
            <span
              >预选{{
                c.selectedPreset.value.output.domain === "material"
                  ? "素材库"
                  : "技能库"
              }}
              <small>生成后可修改</small></span
            >
            <PopupSelect
              v-model="c.selectedLibraryId.value"
              :options="libraries.map(analysisLibraryOption)"
              :placeholder="
                libraries.length ? '请选择具体资料库' : '暂无匹配资料库'
              "
              accessible-label="目标资料库"
              :disabled="disabled || !libraries.length"
              :menu-min-width="260"
            />
          </label>
        </div>
        <div class="analysis-run-bar">
          <div class="analysis-run-progress">
            <strong>已选 {{ c.selectedIds.value.length }} 本</strong
            ><span>{{
              c.status.value === "idle" ? "尚未开始" : c.activity.value
            }}</span>
          </div>
          <div class="analysis-run-actions">
            <button
              v-if="c.result.value"
              @click="
                resultAnchor?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                })
              "
            >
              查看生成结果</button
            ><button
              v-if="c.canRetry.value"
              :disabled="disabled"
              @click="act(() => c.retry())"
            >
              重新分析</button
            ><button
              v-if="c.isBusy.value"
              :disabled="c.status.value === 'stopping'"
              @click="act(() => c.stop())"
            >
              停止</button
            ><button
              v-else
              class="analysis-primary-button"
              :disabled="
                disabled ||
                !c.selectionValid.value ||
                !model ||
                !c.selectedPreset.value
              "
              @click="act(() => c.start())"
            >
              执行“{{ c.selectedPreset.value?.name ?? "当前" }}”预设
            </button>
          </div>
        </div>
      </section>
      <div
        v-if="c.result.value && c.preset.value"
        ref="resultAnchor"
        class="analysis-result-anchor"
      >
        <AnalysisResultPanel
          :result="c.result.value"
          :preset="c.preset.value"
          :catalog-snapshot="catalogSnapshot"
          :target-library-id="c.targetLibraryId.value"
          :saving="saving"
          @update="c.result.value = $event"
          @save="saveResult"
        />
      </div>
    </div>
    <PresetManager
      short
      :open="managerOpen"
      :presets="c.presets.value"
      :saving="saving"
      :catalog-snapshot="catalogSnapshot"
      @close="managerOpen = false"
      @save="savePresets"
      @reset="(id) => act(() => c.resetPresets(id))"
    />
  </div>
</template>
