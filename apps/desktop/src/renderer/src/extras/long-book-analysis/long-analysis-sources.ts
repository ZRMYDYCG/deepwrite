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
  let sourceListSequence = 0;
  let activeSourceListRequests = 0;

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
    if (options.isBusy()) throw new Error(t("sourceLockedWhileRunning"));
    if (source.value?.id === sourceId) return false;
    const selected = await options
      .api()
      .longBookAnalysis.sources.load(sourceId);
    if (options.isDisposed()) return false;
    options.onChange();
    source.value = selected;
    return true;
  }

  async function chooseSource(
    kind: LongBookAnalysisSourceKind
  ): Promise<boolean> {
    if (options.isBusy()) throw new Error(t("sourceLockedWhileRunning"));
    const selected = await options.api().longBookAnalysis.chooseSource(kind);
    if (!selected) return false;
    options.onChange();
    source.value = selected;
    await loadSavedSources();
    return true;
  }

  function replaceChapters(
    chapters: readonly LongBookAnalysisChapter[]
  ): boolean {
    if (!source.value) return false;
    options.onChange();
    source.value = LongBookAnalysisSourceSchema.parse({
      ...source.value,
      chapters: chapters.map((chapter, index) => ({
        ...chapter,
        order: index + 1
      }))
    });
    return true;
  }

  return {
    source,
    savedSources,
    sourcesLoading,
    loadSavedSources,
    loadSavedSource,
    chooseSource,
    replaceChapters
  };
}
