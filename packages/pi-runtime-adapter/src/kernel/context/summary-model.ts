import type {
  StreamFn,
  ThinkingLevel as PiThinkingLevel
} from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  AgentProviderRuntimeConfig,
  AgentRuntimeRef
} from "@deepwrite/contracts";
import {
  buildProviderRuntime,
  toPiThinkingLevel
} from "../../provider-runtime";
import type { SummaryModel } from "./summarize";

/**
 * The run model writes summaries unless the user picked a dedicated summary
 * model; the offline faux runtime summarizes locally.
 */
export function resolveSummaryModel(
  run: {
    model: Model<Api>;
    streamFn: StreamFn;
    thinkingLevel: PiThinkingLevel;
    runtime: AgentRuntimeRef;
  },
  dedicated: AgentProviderRuntimeConfig | undefined
): SummaryModel {
  if (run.runtime.mode === "local-faux") {
    return { ...run, local: true };
  }
  if (!dedicated) return { ...run, local: false };
  const { model, streamFn } = buildProviderRuntime(
    dedicated,
    undefined,
    dedicated.defaultThinkingLevel
  );
  return {
    model,
    streamFn,
    thinkingLevel: toPiThinkingLevel(dedicated.defaultThinkingLevel),
    runtime: {
      provider: dedicated.provider,
      model: dedicated.modelId,
      mode: "provider",
      configId: dedicated.id
    },
    local: false
  };
}
