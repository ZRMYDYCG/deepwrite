import { createScopedTranslator } from "../i18n";
import type { ModelConfig } from "@deepwrite/contracts";

const t = createScopedTranslator("components.freeModelPresentation");

export function isFreeModelAvailable(
  model: Pick<ModelConfig, "status">
): boolean {
  return model.status !== 1;
}

export function freeModelStatus(model: Pick<ModelConfig, "status">): string {
  return isFreeModelAvailable(model) ? t("available") : t("unavailable");
}
