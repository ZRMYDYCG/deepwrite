import { createScopedTranslator } from "../../i18n";
import { ref, shallowRef } from "vue";
import {
  LongBookAnalysisSourceSchema,
  type DeepWriteApi,
  type LongBookAnalysisChapter,
  type LongBookAnalysisSavedSourceSummary,
  type LongBookAnalysisSource,
  type LongBookAnalysisSourceKind
} from "@deepwrite/contracts/renderer";

const t = createScopedTranslator("extras.longBookAnalysis");

/** The imported novel and the saved-source list of the long analysis page. */
export function createLongAnalysisSources(options: {
  api: () => DeepWriteApi;
  isBusy: () => boolean;
  isDisposed: () => boolean;
  /** Called before the source changes, so unfinished tasks are dropped. */
  onChange: () => void;
}) {
  const source = shallowRef<LongBookAnalysisSource | null>(null);
  const savedSources = ref<LongBookAnalysisSavedSourceSummary[]>([]);
  const sourcesLoading = ref(false);
  const sourceSaving = ref(false);
  const sourceDeleting = ref(false);
  const sourceDirty = ref(false);
  let sourceListSequence = 0;
  let activeSourceListRequests = 0;
  let sourceOperationSequence = 0;

  async function loadSavedSources(): Promise<void> {
    const sequence = ++sourceListSequence;
    activeSourceListRequests += 1;
    sourcesLoading.value = true;
    try {
      const catalog = await options.api().longBookAnalysis.sources.list();
      if (!options.isDisposed() && sequence === sourceListSequence) {
        savedSources.value = catalog.sources;
      }
    } finally {
      activeSourceListRequests -= 1;
      if (!options.isDisposed())
        sourcesLoading.value = activeSourceListRequests > 0;
    }
  }

  async function loadSavedSource(sourceId: string): Promise<boolean> {
    if (options.isBusy() || sourceSaving.value || sourceDeleting.value)
      throw new Error(t("sourceLockedWhileRunning"));
    if (source.value?.id === sourceId) return false;
    const sequence = ++sourceOperationSequence;
    const selected = await options
      .api()
      .longBookAnalysis.sources.load(sourceId);
    if (
      options.isDisposed() ||
      sequence !== sourceOperationSequence ||
      options.isBusy()
    )
      return false;
    options.onChange();
    source.value = selected;
    sourceDirty.value = false;
    return true;
  }

  async function chooseSource(
    kind: LongBookAnalysisSourceKind
  ): Promise<boolean> {
    if (options.isBusy() || sourceSaving.value || sourceDeleting.value)
      throw new Error(t("sourceLockedWhileRunning"));
    const sequence = ++sourceOperationSequence;
    const selected = await options.api().longBookAnalysis.chooseSource(kind);
    if (
      !selected ||
      options.isDisposed() ||
      sequence !== sourceOperationSequence ||
      options.isBusy()
    )
      return false;
    options.onChange();
    source.value = selected;
    sourceDirty.value = false;
    await loadSavedSources();
    return true;
  }

  function replaceChapters(
    chapters: readonly LongBookAnalysisChapter[]
  ): boolean {
    if (!source.value) return false;
    if (options.isBusy() || sourceSaving.value || sourceDeleting.value)
      throw new Error(t("sourceLockedWhileRunning"));
    sourceOperationSequence++;
    options.onChange();
    source.value = LongBookAnalysisSourceSchema.parse({
      ...source.value,
      chapters: chapters.map((chapter, index) => ({
        ...chapter,
        order: index + 1
      }))
    });
    sourceDirty.value = true;
    return true;
  }

  async function saveSource(): Promise<void> {
    if (!source.value || (!sourceDirty.value && source.value.revision)) return;
    if (sourceSaving.value || sourceDeleting.value || options.isBusy())
      throw new Error(t("sourceLockedWhileRunning"));
    sourceSaving.value = true;
    sourceOperationSequence++;
    try {
      const current = source.value;
      source.value = await options.api().longBookAnalysis.sources.save({
        sourceId: current.id,
        baseRevision: current.revision ?? 0,
        chapters: current.chapters
      });
      sourceDirty.value = false;
      await loadSavedSources();
    } finally {
      sourceSaving.value = false;
    }
  }

  async function deleteSavedSource(sourceId: string): Promise<void> {
    if (options.isBusy() || sourceSaving.value || sourceDeleting.value)
      throw new Error(t("sourceLockedWhileRunning"));
    sourceDeleting.value = true;
    sourceOperationSequence++;
    sourceListSequence++;
    try {
      await options.api().longBookAnalysis.sources.delete(sourceId);
      if (options.isDisposed()) return;
      sourceListSequence++;
      savedSources.value = savedSources.value.filter(
        (saved) => saved.id !== sourceId
      );
      if (source.value?.id === sourceId) {
        options.onChange();
        source.value = null;
        sourceDirty.value = false;
      }
    } finally {
      sourceDeleting.value = false;
    }
  }

  return {
    source,
    savedSources,
    sourcesLoading,
    sourceSaving,
    sourceDeleting,
    sourceDirty,
    saveSource,
    loadSavedSources,
    loadSavedSource,
    deleteSavedSource,
    chooseSource,
    replaceChapters
  };
}
