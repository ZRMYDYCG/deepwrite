import { initializeTestTranslations } from "../../../test-utils/rendererI18n";
import { createDefaultAppearanceSettings } from "@deepwrite/contracts/renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./appearanceThemeRuntime", async (original) => ({
  ...(await original<typeof import("./appearanceThemeRuntime")>()),
  applyAppearanceThemeToDocument: vi.fn()
}));
vi.mock("./useAppearanceFonts", () => ({
  ensureAppearanceFontLoaded: vi.fn(async () => undefined),
  hydrateAppearanceFontCatalog: vi.fn(async () => undefined)
}));

beforeEach(async () => {
  vi.resetModules();
  await initializeTestTranslations();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup() {
  const save = vi.fn(async () => ({
    settings: createDefaultAppearanceSettings(),
    persisted: true
  }));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn()
    },
    matchMedia: () => ({ matches: false, addEventListener: vi.fn() }),
    deepwrite: {
      appearance: {
        list: async () => ({
          settings: createDefaultAppearanceSettings(),
          persisted: true
        }),
        save
      }
    }
  });
  const { useAppearance } = await import("./useAppearance");
  const appearance = useAppearance();
  await appearance.whenReady();
  return { appearance, save };
}

describe("appearance persistence before close", () => {
  it("flushes the latest theme without waiting for the debounce timer", async () => {
    const { appearance, save } = await setup();
    appearance.setMode("dark");
    await appearance.flush();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "dark" })
    );
  });

  it("blocks close on failed persistence and retries without discarding the live theme", async () => {
    const { appearance, save } = await setup();
    save.mockRejectedValueOnce(new Error("disk unavailable"));
    appearance.setMode("dark");
    await expect(appearance.flush()).rejects.toThrow("外观设置尚未保存");
    expect(appearance.state.mode).toBe("dark");
    await expect(appearance.flush()).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
