import { describe, expect, it, vi } from "vitest";
import type { ModelConfig, SystemEventEnvelope } from "@deepwrite/contracts";
import type { LongBookAnalysisController } from "../extras/long-book-analysis/useLongBookAnalysis";
import type { SubagentAuthoringController } from "./useSubagentAuthoring";
import {
  useLazyLongBookAnalysisController,
  useLazySubagentAuthoringController
} from "./useLazyFeatureControllers";

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(cause: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function analysisModule(controller: LongBookAnalysisController) {
  return {
    useLongBookAnalysis: vi.fn(() => controller)
  };
}

function analysisController(): LongBookAnalysisController {
  return {
    setConfiguredModels: vi.fn(),
    dispose: vi.fn()
  } as unknown as LongBookAnalysisController;
}

function authoringModule(controller: SubagentAuthoringController) {
  return {
    useSubagentAuthoring: vi.fn(() => controller)
  };
}

function authoringController(): SubagentAuthoringController {
  return {
    handleEvent: vi.fn()
  } as unknown as SubagentAuthoringController;
}

describe("lazy feature controllers", () => {
  it("does not create feature state before the feature is requested", () => {
    const api = () => undefined;
    const analysis = useLazyLongBookAnalysisController({ api });
    const authoring = useLazySubagentAuthoringController({ api });

    expect(analysis.controller.value).toBeNull();
    expect(analysis.isBusy.value).toBe(false);
    expect(authoring.controller.value).toBeNull();
  });

  it("coalesces concurrent analysis-controller imports and applies cached models", async () => {
    const loaded = analysisController();
    const loadModule = vi.fn(async () => analysisModule(loaded));
    const analysis = useLazyLongBookAnalysisController({
      api: () => undefined,
      loadModule
    });
    const models = [{ id: "model-placeholder" } as ModelConfig];
    analysis.setConfiguredModels(models, "model-placeholder");

    const [first, second] = await Promise.all([
      analysis.ensureLoaded(),
      analysis.ensureLoaded()
    ]);
    expect(first).toBe(second);
    expect(loadModule).toHaveBeenCalledOnce();
    expect(analysis.controller.value).toBe(first);
    expect(loaded.setConfiguredModels).toHaveBeenCalledWith(
      models,
      "model-placeholder"
    );
    analysis.dispose();
    expect(loaded.dispose).toHaveBeenCalledOnce();
    expect(analysis.controller.value).toBeNull();
  });

  it("forwards events only after authoring has been initialized", async () => {
    const authoring = useLazySubagentAuthoringController({
      api: () => undefined
    });
    const event = {
      type: "unrelated-test-event"
    } as unknown as SystemEventEnvelope;

    authoring.handleEvent(event);
    const controller = await authoring.ensureLoaded();
    const handleEvent = vi.spyOn(controller, "handleEvent");
    authoring.handleEvent(event);
    expect(handleEvent).toHaveBeenCalledWith(event);
  });

  it("disposes a late analysis controller and can reactivate with a new generation", async () => {
    const firstImport = deferred<ReturnType<typeof analysisModule>>();
    const lateController = analysisController();
    const reactivatedController = analysisController();
    let loadAttempt = 0;
    const analysis = useLazyLongBookAnalysisController({
      api: () => undefined,
      loadModule: async () => {
        loadAttempt += 1;
        if (loadAttempt === 1) return await firstImport.promise;
        return analysisModule(reactivatedController);
      }
    });

    const staleLoad = analysis.ensureLoaded();
    const staleRejection = expect(staleLoad).rejects.toThrow(
      "Long book analysis controller load was cancelled."
    );
    analysis.dispose();
    const reactivatedLoad = analysis.ensureLoaded();
    firstImport.resolve(analysisModule(lateController));

    await staleRejection;
    await expect(reactivatedLoad).resolves.toBe(reactivatedController);
    expect(lateController.dispose).toHaveBeenCalledOnce();
    expect(analysis.controller.value).toBe(reactivatedController);
  });

  it("does not publish a late authoring controller after disposal", async () => {
    const firstImport = deferred<ReturnType<typeof authoringModule>>();
    const lateController = authoringController();
    const reactivatedController = authoringController();
    let loadAttempt = 0;
    const authoring = useLazySubagentAuthoringController({
      api: () => undefined,
      loadModule: async () => {
        loadAttempt += 1;
        if (loadAttempt === 1) return await firstImport.promise;
        return authoringModule(reactivatedController);
      }
    });

    const staleLoad = authoring.ensureLoaded();
    const staleRejection = expect(staleLoad).rejects.toThrow(
      "Subagent authoring controller load was cancelled."
    );
    authoring.dispose();
    const reactivatedLoad = authoring.ensureLoaded();
    firstImport.resolve(authoringModule(lateController));

    await staleRejection;
    await expect(reactivatedLoad).resolves.toBe(reactivatedController);
    expect(authoring.controller.value).toBe(reactivatedController);
  });

  it("retries analysis and authoring module imports after a failure", async () => {
    const analysisLoaded = analysisController();
    const authoringLoaded = authoringController();
    const analysisLoadModule = vi
      .fn()
      .mockRejectedValueOnce(new Error("analysis import failed"))
      .mockResolvedValueOnce(analysisModule(analysisLoaded));
    const authoringLoadModule = vi
      .fn()
      .mockRejectedValueOnce(new Error("authoring import failed"))
      .mockResolvedValueOnce(authoringModule(authoringLoaded));
    const analysis = useLazyLongBookAnalysisController({
      api: () => undefined,
      loadModule: analysisLoadModule
    });
    const authoring = useLazySubagentAuthoringController({
      api: () => undefined,
      loadModule: authoringLoadModule
    });

    await expect(analysis.ensureLoaded()).rejects.toThrow(
      "analysis import failed"
    );
    await expect(authoring.ensureLoaded()).rejects.toThrow(
      "authoring import failed"
    );
    expect(analysis.controller.value).toBeNull();
    expect(authoring.controller.value).toBeNull();

    await expect(analysis.ensureLoaded()).resolves.toBe(analysisLoaded);
    await expect(authoring.ensureLoaded()).resolves.toBe(authoringLoaded);
    expect(analysisLoadModule).toHaveBeenCalledTimes(2);
    expect(authoringLoadModule).toHaveBeenCalledTimes(2);
  });
});
