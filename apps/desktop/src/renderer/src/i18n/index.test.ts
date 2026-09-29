import { computed } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultGeneralSettings } from "@deepwrite/contracts";
import { resolveAppLocale } from "../../../localization/locale";
import { createScopedTranslator, locale, setAppLanguage, t } from "./index";
import { initializeAppLanguage, takeInitialGeneralSettings } from "./bootstrap";

afterEach(() => {
  setAppLanguage("zh-CN", "zh-CN");
  takeInitialGeneralSettings();
});

describe("application language", () => {
  it.each([
    ["auto", "zh-Hans-CN", "zh-CN"],
    ["auto", "zh-TW", "zh-CN"],
    ["auto", "en-GB", "en-US"],
    ["auto", "fr-FR", "en-US"],
    ["en-US", "zh-CN", "en-US"],
    ["zh-CN", "en-US", "zh-CN"]
  ] as const)(
    "resolves %s with system %s to %s",
    (preference, system, expected) => {
      expect(resolveAppLocale(preference, system)).toBe(expected);
    }
  );

  it("keeps scoped semantic translations reactive and parameterized", () => {
    const translate = createScopedTranslator("foundation");
    const label = computed(() => translate("language"));
    expect(label.value).toBe("语言");
    setAppLanguage("en-US", "zh-CN");
    expect(label.value).toBe("Language");
    expect(translate("saveFailedDetail", { message: "disk full" })).toContain(
      "disk full"
    );
  });

  it("updates reactive labels and parameterized messages in both directions", () => {
    const label = computed(() => t("foundation.language"));
    expect(label.value).toBe("语言");
    setAppLanguage("en-US", "zh-CN");
    expect(label.value).toBe("Language");
    expect(
      t("foundation.saveFailedDetail", { message: "disk full" })
    ).toContain("disk full");
    setAppLanguage("zh-CN", "en-US");
    expect(label.value).toBe("语言");
  });

  it("resolves persisted language before startup finishes and shares its snapshot once", async () => {
    const settings = {
      ...createDefaultGeneralSettings(),
      language: "en-US" as const
    };
    const api = { list: vi.fn(async () => ({ persisted: true, settings })) };
    const root = { lang: "", dataset: {} as DOMStringMap };
    await initializeAppLanguage(api, "zh-CN", root);
    expect(root).toEqual({ lang: "en-US", dataset: { appLanguage: "en-US" } });
    expect(locale.value).toBe("en-US");
    expect(takeInitialGeneralSettings()?.settings).toEqual(settings);
    expect(takeInitialGeneralSettings()).toBeUndefined();
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it("uses system language when startup cannot read preferences", async () => {
    const root = { lang: "", dataset: {} as DOMStringMap };
    await initializeAppLanguage(
      { list: vi.fn().mockRejectedValue(new Error("unavailable")) },
      "en-GB",
      root
    );
    expect(root.lang).toBe("en-US");
    expect(takeInitialGeneralSettings()).toBeUndefined();
  });
});
