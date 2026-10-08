import {
  createDefaultGeneralSettings,
  type DeepWriteApi,
  type GeneralSettings
} from "@deepwrite/contracts";
import { ref, shallowRef } from "vue";
import { vi } from "vitest";
import { useGeneralSettingsCoordinator } from "./useGeneralSettingsCoordinator";

type GeneralSettingsApi = Pick<
  DeepWriteApi["generalSettings"],
  "list" | "save"
>;

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

export function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

export function storage(fails = false): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key) => values.get(key) ?? null),
    key: vi.fn((index) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key) => values.delete(key)),
    setItem: vi.fn((key, value) => {
      if (fails) throw new Error("storage unavailable");
      values.set(key, value);
    })
  };
}

export function harness(
  overrides: {
    api?: GeneralSettingsApi | null;
    legacyAutoSave?: boolean;
    storage?: Storage;
  } = {}
) {
  const settings = shallowRef<GeneralSettings>(createDefaultGeneralSettings());
  const autoSaveEnabled = ref(false);
  const applyApprovalMode = vi.fn();
  const scheduleDirtyAutoSave = vi.fn();
  const cancelAutoSave = vi.fn();
  const resumeAutomaticAgentEdits = vi.fn();
  const warning = vi.fn();
  const publishLoaded = vi.fn((loaded: GeneralSettings) => {
    settings.value = loaded;
  });
  const root = { lang: "", dataset: {} as DOMStringMap };
  const api: GeneralSettingsApi | undefined =
    overrides.api === null
      ? undefined
      : (overrides.api ?? {
          list: vi.fn(async () => ({
            persisted: true,
            settings: createDefaultGeneralSettings()
          })),
          save: vi.fn(async () => ({
            persisted: true,
            settings: createDefaultGeneralSettings()
          }))
        });
  const coordinator = useGeneralSettingsCoordinator({
    settings,
    autoSaveEnabled,
    api: () => api,
    publishLoaded,
    legacyAutoSave: overrides.legacyAutoSave ?? false,
    storage: overrides.storage ?? storage(),
    documentRoot: root,
    browserLanguage: () => "zh-Hans-CN",
    applyApprovalMode,
    scheduleDirtyAutoSave,
    cancelAutoSave,
    resumeAutomaticAgentEdits,
    notifications: { warning }
  });
  return {
    api,
    applyApprovalMode,
    autoSaveEnabled,
    cancelAutoSave,
    coordinator,
    resumeAutomaticAgentEdits,
    root,
    publishLoaded,
    scheduleDirtyAutoSave,
    settings,
    warning
  };
}
