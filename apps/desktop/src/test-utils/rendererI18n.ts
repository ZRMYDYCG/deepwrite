import { inject } from "vitest";
import type { MessageSchema } from "../renderer/src/i18n/messages";

declare module "vitest" {
  interface ProvidedContext {
    i18nMessages: Record<"zh-CN" | "en-US", MessageSchema>;
  }
}

/** Call again after vi.resetModules() to mirror production's pre-mount bootstrap. */
export async function initializeTestTranslations(): Promise<void> {
  const { registerMessageCatalog, setAppLanguage } =
    await import("../renderer/src/i18n");
  const messages = inject("i18nMessages");
  registerMessageCatalog("zh-CN", messages["zh-CN"]);
  registerMessageCatalog("en-US", messages["en-US"]);
  setAppLanguage("zh-CN", "zh-CN");
}
