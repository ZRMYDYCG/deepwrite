import { useLazyModelFeature } from "./useLazyModelFeature";
import { shallowRef, type ComputedRef, type ShallowRef } from "vue";
import type {
  DeepWriteApi,
  ModelConfig,
  SystemEventEnvelope
} from "@deepwrite/contracts";
import type { LongBookAnalysisController } from "../extras/long-book-analysis/useLongBookAnalysis";
import type { SubagentAuthoringController } from "./useSubagentAuthoring";

export interface LazySubagentAuthoringController {
  controller: ShallowRef<SubagentAuthoringController | null>;
  ensureLoaded(): Promise<SubagentAuthoringController>;
  handleEvent(event: SystemEventEnvelope): void;
  dispose(): void;
}

export interface LazyLongBookAnalysisController {
  controller: ShallowRef<LongBookAnalysisController | null>;
  isBusy: ComputedRef<boolean>;
  ensureLoaded(): Promise<LongBookAnalysisController>;
  setConfiguredModels(
    models: readonly ModelConfig[],
    defaultModelId?: string
  ): void;
  handleEvent(event: SystemEventEnvelope): void;
  dispose(): void;
}

type SubagentAuthoringModule = Pick<
  typeof import("./useSubagentAuthoring"),
  "useSubagentAuthoring"
>;

type LongBookAnalysisModule = Pick<
  typeof import("../extras/long-book-analysis/useLongBookAnalysis"),
  "useLongBookAnalysis"
>;

function cancelledLoadError(feature: string): Error {
  return new Error(`${feature} controller load was cancelled.`);
}

export function useLazySubagentAuthoringController(options: {
  api: () => DeepWriteApi | undefined;
  loadModule?: () => Promise<SubagentAuthoringModule>;
}): LazySubagentAuthoringController {
  const controller = shallowRef<SubagentAuthoringController | null>(null);
  let loadPromise: Promise<SubagentAuthoringController> | null = null;
  let generation = 0;
  let active = true;

  async function ensureLoaded(): Promise<SubagentAuthoringController> {
    if (controller.value) return controller.value;
    if (loadPromise) return await loadPromise;
    active = true;
    const loadGeneration = generation;
    const pending = (async () => {
      const { useSubagentAuthoring } = await (options.loadModule?.() ??
        import("./useSubagentAuthoring"));
      const loaded = useSubagentAuthoring({ api: options.api });
      if (!active || generation !== loadGeneration) {
        throw cancelledLoadError("Subagent authoring");
      }
      controller.value = loaded;
      return loaded;
    })();
    loadPromise = pending;
    try {
      return await pending;
    } finally {
      if (loadPromise === pending) loadPromise = null;
    }
  }

  return {
    controller,
    ensureLoaded,
    handleEvent(event) {
      controller.value?.handleEvent(event);
    },
    dispose() {
      active = false;
      generation += 1;
      loadPromise = null;
      controller.value = null;
    }
  };
}

export function useLazyLongBookAnalysisController(options: {
  api: () => DeepWriteApi | undefined;
  loadModule?: () => Promise<LongBookAnalysisModule>;
}): LazyLongBookAnalysisController {
  return useLazyModelFeature("Long book analysis", async () => {
    const module = await (options.loadModule?.() ??
      (await import("../extras/long-book-analysis/loader")).loadController());
    return module.useLongBookAnalysis({ api: options.api });
  });
}
