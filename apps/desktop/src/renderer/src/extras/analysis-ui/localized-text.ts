import { computed, shallowRef } from "vue";
import { t } from "../../i18n";

/** User/model text stays literal; application messages resolve when displayed. */
export type LocalizedText = string | (() => string);

export function resolveLocalizedText(value: LocalizedText): string {
  return typeof value === "function" ? value() : value;
}

/** Captures event parameters now while allowing its label to follow the locale. */
export function localizedMessage(
  key: Parameters<typeof t>[0],
  params?: Parameters<typeof t>[1]
): () => string {
  const snapshot = params ? { ...params } : undefined;
  return () => t(key, snapshot);
}

export function localizedTextRef(initial: LocalizedText = "") {
  const source = shallowRef<LocalizedText>(initial);
  return computed<string, LocalizedText>({
    get: () => resolveLocalizedText(source.value),
    set: (value) => {
      source.value = value;
    }
  });
}

export function localizedNullableTextRef() {
  const source = shallowRef<LocalizedText | null>(null);
  return computed<string | null, LocalizedText | null>({
    get: () =>
      source.value === null ? null : resolveLocalizedText(source.value),
    set: (value) => {
      source.value = value;
    }
  });
}
