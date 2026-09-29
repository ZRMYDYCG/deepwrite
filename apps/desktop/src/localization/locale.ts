import type { AppLanguage } from "@deepwrite/contracts";

export type AppLocale = Exclude<AppLanguage, "auto">;

/** Both desktop menus and the Renderer use the same supported-locale policy. */
export function resolveAppLocale(
  language: AppLanguage,
  systemLocale: string
): AppLocale {
  if (language !== "auto") return language;
  return /^zh(?:[-_]|$)/i.test(systemLocale) ? "zh-CN" : "en-US";
}
