import { createI18n } from "vue-i18n";
import { describe, expect, it, vi } from "vitest";
import { messages } from "./messages";

function flatten(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof entry === "string"
        ? [[path, entry]]
        : Object.entries(flatten(entry, path));
    })
  );
}

function parameters(message: string): string[] {
  return [
    ...new Set(
      [...message.matchAll(/\{([a-zA-Z_][\w]*)\}/g)].map((match) => match[1]!)
    )
  ].sort();
}

describe("translation resources", () => {
  it("provides matching semantic keys and interpolation parameters", () => {
    const chinese = flatten(messages["zh-CN"]);
    const english = flatten(messages["en-US"]);
    expect(Object.keys(english).sort()).toEqual(Object.keys(chinese).sort());
    for (const key of Object.keys(chinese)) {
      expect(parameters(english[key]!), key).toEqual(parameters(chinese[key]!));
    }
  });

  it("compiles every message using the production message syntax", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const translator = createI18n({ legacy: false, locale: "zh-CN", messages });
    try {
      for (const language of ["zh-CN", "en-US"] as const) {
        translator.global.locale.value = language;
        for (const [key, message] of Object.entries(
          flatten(messages[language])
        )) {
          const params = Object.fromEntries(
            parameters(message).map((name) => [name, "test"])
          );
          translator.global.t(key, params);
          expect(error, `${language}: ${key}`).not.toHaveBeenCalled();
        }
      }
    } finally {
      error.mockRestore();
      translator.dispose();
    }
  });
});
