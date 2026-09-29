import type {
  DeepWriteApi,
  GeneralSettingsSnapshot
} from "@deepwrite/contracts";
import { setAppLanguage, locale } from "./index";

type SettingsApi = Pick<DeepWriteApi["generalSettings"], "list">;
let initialSnapshot: GeneralSettingsSnapshot | undefined;

/** Resolve persisted language before mounting any visible application UI. */
export async function initializeAppLanguage(
  api: SettingsApi | undefined,
  systemLocale: string,
  root: Pick<HTMLElement, "lang" | "dataset">
): Promise<void> {
  initialSnapshot = undefined;
  try {
    initialSnapshot = await api?.list();
  } catch {
    // The settings coordinator retries and reports the normal load warning.
  }
  const language = initialSnapshot?.settings.language ?? "auto";
  setAppLanguage(language, systemLocale);
  root.lang = locale.value;
  root.dataset.appLanguage = language;
}

export function takeInitialGeneralSettings():
  GeneralSettingsSnapshot | undefined {
  const snapshot = initialSnapshot;
  initialSnapshot = undefined;
  return snapshot;
}
