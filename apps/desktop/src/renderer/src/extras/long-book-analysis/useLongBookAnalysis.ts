import {
  localizedMessage,
  localizedTextRef,
  localizedNullableTextRef
} from "../analysis-ui/localized-text";
import { createScopedTranslator } from "../../i18n";
import { createLongAnalysisResultState } from "./analysis-result-state";
import {
  computed,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref
} from "vue";
import {
  ExtrasAgentSettingsInputSchema,
  LongBookAnalysisSourceSchema,
  type DeepWriteApi,
  type LongBookAnalysisChapter,
  type LongBookAnalysisPreset,
  type LongBookAnalysisResult,
  type LongBookAnalysisSavedSourceSummary,
  type LongBookAnalysisSource,
  type LongBookAnalysisSourceKind,
  type ModelConfig,
  type SystemEventEnvelope,
  type ThinkingLevel
} from "@deepwrite/contracts/renderer";
import {
  LongBookAnalysisPipeline,
  type LongBookAnalysisPhase
} from "./analysis-pipeline";
import {
  formatAnalysisProgress,
  type LongBookAnalysisProcessEntry
} from "./analysis-process";

const t = createScopedTranslator("extras.longBookAnalysis");

export type LongBookAnalysisRunStatus =
  "idle" | "running" | "stopping" | "stopped" | "error" | "completed";

export interface LongBookAnalysisStartInput {
  presetId: string;
  startOrder: number;
  endOrder: number;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
}

export interface LongBookAnalysisPersistInput {
  libraryId: string;
  baseProjectRevision?: number;
}

export interface LongBookAnalysisController {
  source: Ref<LongBookAnalysisSource | null>;
  savedSources: Ref<LongBookAnalysisSavedSourceSummary[]>;
  sourcesLoading: Readonly<Ref<boolean>>;
  presets: Ref<LongBookAnalysisPreset[]>;
  presetsLoading: Readonly<Ref<boolean>>;
  selectedModelId: Ref<string>;
  selectedThinkingLevel: Ref<ThinkingLevel>;
  activePresetId: ComputedRef<string>;
  resultPreset: Readonly<Ref<LongBookAnalysisPreset | null>>;
  resultIsPrevious: ComputedRef<boolean>;
  resultContext: Readonly<Ref<string>>;
  status: Readonly<Ref<LongBookAnalysisRunStatus>>;
  phase: Readonly<Ref<LongBookAnalysisPhase | null>>;
  progressText: ComputedRef<string>;
  error: Readonly<Ref<string | null>>;
  result: Ref<LongBookAnalysisResult | null>;
  processEntries: Readonly<Ref<LongBookAnalysisProcessEntry[]>>;
  currentActivity: Readonly<Ref<string>>;
  liveOutput: Readonly<Ref<string>>;
  isBusy: ComputedRef<boolean>;
  canRetry: ComputedRef<boolean>;
  setConfiguredModels(
    models: readonly ModelConfig[],
    defaultModelId?: string
  ): void;
  loadPresets(): Promise<void>;
  savePresets(presets: readonly LongBookAnalysisPreset[]): Promise<void>;
  resetPresets(presetId?: string): Promise<void>;
  loadSavedSources(): Promise<void>;
  loadSavedSource(sourceId: string): Promise<boolean>;
  chooseSource(kind: LongBookAnalysisSourceKind): Promise<boolean>;
  replaceChapters(chapters: readonly LongBookAnalysisChapter[]): boolean;
  start(input: LongBookAnalysisStartInput): Promise<boolean>;
  retry(): Promise<boolean>;
  stop(): Promise<boolean>;
  resetWorkspace(): void;
  persistResult(input: LongBookAnalysisPersistInput): Promise<void>;
  handleEvent(event: SystemEventEnvelope): void;
  dispose(): void;
}

export function useLongBookAnalysis(options: {
  api: () => DeepWriteApi | undefined;
}): LongBookAnalysisController {
  const source = shallowRef<LongBookAnalysisSource | null>(null);
  const savedSources = ref<LongBookAnalysisSavedSourceSummary[]>([]);
  const sourcesLoading = ref(false);
  const presets = ref<LongBookAnalysisPreset[]>([]);
  const presetsLoading = ref(false);
  const selectedModelId = ref("");
  const selectedThinkingLevel = ref<ThinkingLevel>("off");
  const configuredModels = shallowRef<readonly ModelConfig[]>([]);
  const status = ref<LongBookAnalysisRunStatus>("idle");
  const phase = ref<LongBookAnalysisPhase | null>(null);
  const completedUnits = ref(0);
  const estimatedUnits = ref(0);
  const error = localizedNullableTextRef();
  const pendingResult = ref<LongBookAnalysisResult | null>(null);
  const processEntries = ref<LongBookAnalysisProcessEntry[]>([]);
  const currentActivity = localizedTextRef();
  const liveOutput = ref("");
  const isBusy = computed(
    () => status.value === "running" || status.value === "stopping"
  );
  const canRetry = computed(
    () =>
      (status.value === "error" || status.value === "stopped") &&
      pipeline.hasJob
  );
  const progressText = computed(() => {
    return formatAnalysisProgress(
      phase.value,
      completedUnits.value,
      estimatedUnits.value
    );
  });
  let disposed = false;
  let sourceListSequence = 0;
  let activeSourceListRequests = 0;

  function api(): DeepWriteApi {
    const current = options.api();
    if (!current) throw new Error(t("novelAnalysisUnavailable"));
    return current;
  }

  const pipeline = new LongBookAnalysisPipeline(api, configuredModels, {
    status,
    phase,
    completedUnits,
    estimatedUnits,
    error,
    result: pendingResult,
    processEntries,
    currentActivity,
    liveOutput
  });
  const resultState = createLongAnalysisResultState({
    api,
    status,
    pendingResult,
    preset: () => pipeline.preset
  });

  watch(selectedModelId, (modelId) => {
    const model = configuredModels.value.find((item) => item.id === modelId);
    selectedThinkingLevel.value = model?.defaultThinkingLevel ?? "off";
  });

  function setConfiguredModels(
    models: readonly ModelConfig[],
    defaultModelId?: string
  ): void {
    configuredModels.value = models;
    const selected =
      models.find((model) => model.id === selectedModelId.value) ??
      (defaultModelId
        ? models.find((model) => model.id === defaultModelId)
        : undefined) ??
      models[0];
    if (!selected) {
      selectedModelId.value = "";
      selectedThinkingLevel.value = "off";
      return;
    }
    const modelChanged = selectedModelId.value !== selected.id;
    selectedModelId.value = selected.id;
    if (
      modelChanged ||
      (selectedThinkingLevel.value !== "off" &&
        !selected.thinkingLevelOptions.includes(selectedThinkingLevel.value))
    ) {
      selectedThinkingLevel.value = selected.defaultThinkingLevel;
    }
  }

  async function loadPresets(): Promise<void> {
    if (presetsLoading.value) return;
    presetsLoading.value = true;
    try {
      const settings =
        await api().extrasAgents.profiles.list("long-book-analysis");
      if (!disposed) presets.value = settings.profiles;
    } finally {
      if (!disposed) presetsLoading.value = false;
    }
  }

  async function savePresets(
    nextPresets: readonly LongBookAnalysisPreset[]
  ): Promise<void> {
    const input = ExtrasAgentSettingsInputSchema.parse({
      agentId: "long-book-analysis",
      profiles: nextPresets.map(({ builtin: _builtin, ...preset }) => preset)
    });
    if (input.agentId !== "long-book-analysis") return;
    pipeline.reset();
    presets.value = (await api().extrasAgents.profiles.save(input)).profiles;
  }

  async function resetPresets(presetId?: string): Promise<void> {
    pipeline.reset();
    presets.value = (
      await api().extrasAgents.profiles.reset("long-book-analysis", presetId)
    ).profiles;
  }

  async function loadSavedSources(): Promise<void> {
    const sequence = ++sourceListSequence;
    activeSourceListRequests += 1;
    sourcesLoading.value = true;
    try {
      const catalog = await api().longBookAnalysis.sources.list();
      if (!disposed && sequence === sourceListSequence) {
        savedSources.value = catalog.sources;
      }
    } finally {
      activeSourceListRequests -= 1;
      if (!disposed) sourcesLoading.value = activeSourceListRequests > 0;
    }
  }

  async function loadSavedSource(sourceId: string): Promise<boolean> {
    if (isBusy.value) {
      throw new Error(t("sourceLockedWhileRunning"));
    }
    if (source.value?.id === sourceId) return false;
    const selected = await api().longBookAnalysis.sources.load(sourceId);
    if (disposed) return false;
    pipeline.reset();
    source.value = selected;
    return true;
  }

  async function chooseSource(
    kind: LongBookAnalysisSourceKind
  ): Promise<boolean> {
    if (isBusy.value) {
      throw new Error(t("sourceLockedWhileRunning"));
    }
    const selected = await api().longBookAnalysis.chooseSource(kind);
    if (!selected) return false;
    pipeline.reset();
    source.value = selected;
    await loadSavedSources();
    return true;
  }

  function replaceChapters(
    chapters: readonly LongBookAnalysisChapter[]
  ): boolean {
    if (!source.value) return false;
    pipeline.reset();
    source.value = LongBookAnalysisSourceSchema.parse({
      ...source.value,
      chapters: chapters.map((chapter, index) => ({
        ...chapter,
        order: index + 1
      }))
    });
    return true;
  }

  async function start(input: LongBookAnalysisStartInput): Promise<boolean> {
    if (isBusy.value) return false;
    if (!source.value) throw new Error(t("importSourceRequired"));
    const preset = presets.value.find((item) => item.id === input.presetId);
    if (!preset) throw new Error(t("presetRequired"));
    pipeline.start(source.value, preset, {
      ...input,
      modelId: input.modelId || selectedModelId.value,
      thinkingLevel: input.thinkingLevel ?? selectedThinkingLevel.value
    });
    resultState.setPendingContext(
      localizedMessage("extras.longBookAnalysis.presetChapterRange", {
        preset: source.value.name,
        start: input.startOrder,
        end: input.endOrder
      })
    );
    return true;
  }

  return {
    source,
    savedSources,
    sourcesLoading,
    presets,
    presetsLoading,
    selectedModelId,
    selectedThinkingLevel,
    activePresetId: resultState.activePresetId,
    resultPreset: resultState.resultPreset,
    resultIsPrevious: resultState.resultIsPrevious,
    resultContext: resultState.resultContext,
    status,
    phase,
    progressText,
    error,
    result: resultState.result,
    processEntries,
    currentActivity,
    liveOutput,
    isBusy,
    canRetry,
    setConfiguredModels,
    loadPresets,
    savePresets,
    resetPresets,
    loadSavedSources,
    loadSavedSource,
    chooseSource,
    replaceChapters,
    start,
    retry: async () => pipeline.retry(),
    stop: () => pipeline.stop(),
    resetWorkspace() {
      pipeline.reset();
      resultState.clear();
      source.value = null;
    },
    persistResult: resultState.persistResult,
    handleEvent: (event) => pipeline.handleEvent(event),
    dispose() {
      disposed = true;
      pipeline.dispose();
      resultState.dispose();
    }
  };
}
