import { createScopedTranslator } from "../../i18n";
import {
  isDeepSeekWebSearchCompatible,
  type ModelApi
} from "@deepwrite/contracts/renderer";

const t = createScopedTranslator("workspace.webSearch");

export const WORKSPACE_WEB_SEARCH_DISABLED_REASON = t(
  "onlyDeepseekModelsUsingTheOpenaiResponsesOrAnthropic"
);

export const WORKSPACE_WEB_SEARCH_AUTO_DISABLED_MESSAGE = t(
  "webAccessIsOffOnlyDeepseekModelsUsingThe"
);

type WebSearchModel =
  | {
      provider: string;
      api: ModelApi;
    }
  | null
  | undefined;

export function isWorkspaceWebSearchAvailable(model: WebSearchModel): boolean {
  return isDeepSeekWebSearchCompatible(model);
}

export function resolveWorkspaceWebSearchEnabled(
  model: WebSearchModel,
  requested: boolean | undefined
): boolean {
  return requested === true && isDeepSeekWebSearchCompatible(model);
}

export function workspaceWebSearchAfterModelChange(
  model: WebSearchModel,
  currentlyEnabled: boolean
): { enabled: boolean; autoDisabled: boolean } {
  if (!currentlyEnabled) {
    return { enabled: false, autoDisabled: false };
  }
  if (isDeepSeekWebSearchCompatible(model)) {
    return { enabled: true, autoDisabled: false };
  }
  return { enabled: false, autoDisabled: true };
}

export function workspaceWebSearchPromptFields(enabled: boolean): {
  webSearchEnabled?: true;
} {
  return enabled ? { webSearchEnabled: true } : {};
}
