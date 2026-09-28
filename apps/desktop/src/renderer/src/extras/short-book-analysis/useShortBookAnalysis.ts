import { analysisResultEntry } from "../long-book-analysis/analysis-result-content";
import { computed, ref, shallowRef, watch } from "vue";
import {
  ExtrasAgentSettingsInputSchema,
  type DeepWriteApi,
  type ModelConfig,
  type ShortBookAnalysisPreset,
  type ShortBookAnalysisSource,
  type ShortBookAnalysisSourceSummary,
  type ShortBookAnalysisTextInput,
  type ThinkingLevel
} from "@deepwrite/contracts/renderer";
import { createShortAnalysisRun } from "./analysis-run";
export type ShortBookAnalysisController = ReturnType<
  typeof useShortBookAnalysis
>;
export function useShortBookAnalysis(options: {
  api: () => DeepWriteApi | undefined;
}) {
  const api = () => {
    const current = options.api();
    if (!current) throw new Error("当前环境不支持短篇拆书分析。");
    return current;
  };
  const run = createShortAnalysisRun(api);
  const presets = ref<ShortBookAnalysisPreset[]>([]);
  const savedSources = ref<ShortBookAnalysisSourceSummary[]>([]);
  const drafts = ref<ShortBookAnalysisSource[]>([]);
  const selectedIds = ref<string[]>([]);
  const activeId = ref("");
  const loading = ref(false);
  const selectedPresetId = ref("");
  const selectedModelId = ref("");
  const selectedThinkingLevel = ref<ThinkingLevel>("off");
  const selectedLibraryId = ref("");
  const models = shallowRef<readonly ModelConfig[]>([]);
  let disposed = false;
  const selectedPreset = computed(
    () => presets.value.find((p) => p.id === selectedPresetId.value) ?? null
  );
  const selectedBooks = computed(() =>
    selectedIds.value
      .map((id) => drafts.value.find((b) => b.id === id))
      .filter((b): b is ShortBookAnalysisSource => Boolean(b))
  );
  const selectionLimit = computed(() =>
    selectedPreset.value?.selectionMode === "single" ? 1 : 10
  );
  const selectionValid = computed(
    () =>
      selectedBooks.value.length > 0 &&
      selectedBooks.value.every(
        (book) => book.title.trim() && book.text.trim()
      ) &&
      selectedBooks.value.length <= 10 &&
      (selectedPreset.value?.selectionMode !== "single" ||
        selectedBooks.value.length === 1)
  );
  const stopModelWatch = watch(selectedModelId, () => {
    selectedThinkingLevel.value =
      models.value.find((m) => m.id === selectedModelId.value)
        ?.defaultThinkingLevel ?? "off";
  });
  function editable() {
    if (run.isBusy.value || loading.value)
      throw new Error("正在处理，请稍后再修改。");
  }
  async function loadSources() {
    const catalog = await api().shortBookAnalysis.sources.list();
    if (!disposed) savedSources.value = catalog.sources;
  }
  async function loadPresets() {
    const settings = await api().extrasAgents.profiles.list(
      "short-book-analysis"
    );
    if (disposed) return;
    presets.value = settings.profiles;
    if (!presets.value.some((p) => p.id === selectedPresetId.value))
      selectedPresetId.value = presets.value[0]?.id ?? "";
  }
  async function addDrafts(sources: ShortBookAnalysisSource[]) {
    if (disposed) return;
    run.clear();
    for (const source of sources) {
      if (!drafts.value.some((b) => b.id === source.id))
        drafts.value.push(source);
    }
    activeId.value = sources[0]?.id ?? activeId.value;
    await loadSources();
  }
  function removeDraft(id: string) {
    const index = drafts.value.findIndex((book) => book.id === id);
    if (index < 0) return;
    run.clear();
    drafts.value = drafts.value.filter((book) => book.id !== id);
    selectedIds.value = selectedIds.value.filter((value) => value !== id);
    if (activeId.value === id)
      activeId.value =
        drafts.value[Math.min(index, drafts.value.length - 1)]?.id ?? "";
  }
  return {
    ...run,
    presets,
    savedSources,
    drafts,
    selectedIds,
    activeId,
    loading,
    selectedPresetId,
    selectedModelId,
    selectedThinkingLevel,
    selectedLibraryId,
    selectedPreset,
    selectedBooks,
    selectionLimit,
    selectionValid,
    loadPresets,
    loadSources,
    setConfiguredModels(next: readonly ModelConfig[], defaultModelId?: string) {
      models.value = next;
      const current =
        next.find((m) => m.id === selectedModelId.value) ??
        next.find((m) => m.id === defaultModelId) ??
        next[0];
      selectedModelId.value = current?.id ?? "";
      if (
        current &&
        !current.thinkingLevelOptions.includes(selectedThinkingLevel.value)
      )
        selectedThinkingLevel.value = current.defaultThinkingLevel;
    },
    async chooseSources() {
      editable();
      loading.value = true;
      try {
        const sources = await api().shortBookAnalysis.chooseSources();
        if (sources) await addDrafts(sources);
      } finally {
        loading.value = false;
      }
    },
    async addText(input: ShortBookAnalysisTextInput) {
      editable();
      if (!input.title.trim()) throw new Error("请填写短篇书名。");
      if (!input.text.trim()) throw new Error("请粘贴完整正文。");
      loading.value = true;
      try {
        await addDrafts([await api().shortBookAnalysis.addText(input)]);
      } finally {
        loading.value = false;
      }
    },
    async loadSource(id: string) {
      editable();
      loading.value = true;
      try {
        const source = await api().shortBookAnalysis.sources.load(id);
        await addDrafts([source]);
      } finally {
        loading.value = false;
      }
    },
    toggleBook(id: string) {
      editable();
      if (!drafts.value.some((b) => b.id === id)) return;
      const selected = selectedIds.value.includes(id);
      if (!selected && selectedIds.value.length >= selectionLimit.value)
        throw new Error(
          selectionLimit.value === 1
            ? "当前预设仅支持一本，请先取消原选择。"
            : "每次最多选择 10 本短篇。"
        );
      run.clear();
      selectedIds.value = selected
        ? selectedIds.value.filter((value) => value !== id)
        : [...selectedIds.value, id];
    },
    removeBook(id: string) {
      editable();
      removeDraft(id);
    },
    async deleteSource(id: string) {
      editable();
      loading.value = true;
      try {
        await api().shortBookAnalysis.sources.delete(id);
        if (disposed) return;
        removeDraft(id);
        savedSources.value = savedSources.value.filter(
          (book) => book.id !== id
        );
      } finally {
        loading.value = false;
      }
    },
    updateBook(id: string, input: { title: string; text: string }) {
      editable();
      const index = drafts.value.findIndex((b) => b.id === id);
      if (index < 0) return;
      run.clear();
      drafts.value[index] = { ...drafts.value[index]!, ...input };
    },
    async savePresets(next: readonly ShortBookAnalysisPreset[]) {
      editable();
      const input = ExtrasAgentSettingsInputSchema.parse({
        agentId: "short-book-analysis",
        profiles: next.map(({ builtin, ...preset }) => {
          void builtin;
          return preset;
        })
      });
      if (input.agentId !== "short-book-analysis") return;
      run.clear();
      presets.value = (await api().extrasAgents.profiles.save(input)).profiles;
      await loadPresets();
    },
    async resetPresets(id?: string) {
      editable();
      run.clear();
      presets.value = (
        await api().extrasAgents.profiles.reset("short-book-analysis", id)
      ).profiles;
      await loadPresets();
    },
    start() {
      editable();
      const preset = selectedPreset.value;
      const model = models.value.find((m) => m.id === selectedModelId.value);
      if (!preset || !model) throw new Error("请选择预设和模型。");
      run.start(
        selectedBooks.value,
        preset,
        model,
        selectedThinkingLevel.value,
        selectedLibraryId.value
      );
    },
    async persistResult(input: {
      libraryId: string;
      baseProjectRevision?: number;
    }) {
      const output = run.preset.value?.output;
      const result = run.result.value;
      if (!output || !result || run.status.value !== "completed")
        throw new Error("没有已完成的分析结果。");
      const base = {
        libraryId: input.libraryId,
        ...analysisResultEntry(result, output.domain),
        ...(input.baseProjectRevision !== undefined
          ? { baseProjectRevision: input.baseProjectRevision }
          : {})
      };
      if (output.domain === "material")
        await api().catalog.createLibraryEntry({
          ...base,
          domain: "material",
          stageId: output.stageId
        });
      else
        await api().catalog.createLibraryEntry({
          ...base,
          domain: "skill",
          stageId: output.stageId
        });
    },
    dispose() {
      disposed = true;
      stopModelWatch();
      run.dispose();
    }
  };
}
