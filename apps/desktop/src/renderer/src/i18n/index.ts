import type { AppLanguage } from "@deepwrite/contracts";
import { createI18n } from "vue-i18n";
import { resolveAppLocale } from "../../../localization/locale";
import type { MessageSchema, TranslationKey } from "./messages";
import type { AppLocale } from "../../../localization/locale";
import foundationZh from "./messages/foundation/zh-CN";
import foundationEn from "./messages/foundation/en-US";

export const i18n = createI18n({
  legacy: false,
  globalInjection: false,
  locale: "zh-CN",
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": { foundation: foundationZh } as MessageSchema,
    "en-US": { foundation: foundationEn } as MessageSchema
  }
});

export function registerMessageCatalog(
  language: AppLocale,
  messages: MessageSchema
): void {
  i18n.global.setLocaleMessage(language, messages);
}

export const locale = i18n.global.locale;

/** Also usable in computed values, stores, and event-driven notifications. */
export function t(
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  return params ? i18n.global.t(key, params) : i18n.global.t(key);
}

export function setAppLanguage(
  language: AppLanguage,
  systemLocale: string
): void {
  locale.value = resolveAppLocale(language, systemLocale);
}

type Namespace<Key extends string> = Key extends `${infer Head}.${infer Tail}`
  ? Head | `${Head}.${Namespace<Tail>}`
  : never;
type ScopedKey<Scope extends string> = TranslationKey extends infer Key
  ? Key extends `${Scope}.${infer Relative}`
    ? Relative
    : never
  : never;

/** Keep semantic keys typed while avoiding repeated domain prefixes per module. */
export function createScopedTranslator<Scope extends Namespace<TranslationKey>>(
  scope: Scope
): (key: ScopedKey<Scope>, params?: Record<string, string | number>) => string {
  return (key, params) => t(`${scope}.${key}` as TranslationKey, params);
}
