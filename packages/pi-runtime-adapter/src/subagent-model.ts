import type { StreamFn, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  AgentRuntimeRef,
  ShortAgentSubagentDefinition
} from "@deepwrite/contracts";
import { runtimeFromConfig, runtimeFromModel } from "./subagent-helpers";
import type { BuildSpawnSubagentToolInput } from "./subagent-types";

/** Model choice of a member or a draw evaluator; `inherit` is the parent's. */
export type SubagentModelSettings = Pick<
  ShortAgentSubagentDefinition,
  "modelMode" | "modelId" | "thinkingLevel" | "temperature"
>;

export interface ResolvedSubagentModel {
  model: Model<Api>;
  streamFn: StreamFn;
  thinkingLevel: ThinkingLevel;
}

function customModelId(settings: SubagentModelSettings): string | undefined {
  return settings.modelMode === "custom"
    ? settings.modelId?.trim() || undefined
    : undefined;
}

export function subagentModelRuntime(
  input: BuildSpawnSubagentToolInput,
  settings: SubagentModelSettings
): AgentRuntimeRef {
  const modelId = customModelId(settings);
  const config = modelId ? input.subagentRuntimeConfigs?.[modelId] : undefined;
  return config
    ? runtimeFromConfig(config)
    : (input.parentRuntime ?? runtimeFromModel(input.model));
}

/** Throws a message naming `owner` when a custom model is unavailable. */
export function resolveSubagentModel(
  input: BuildSpawnSubagentToolInput,
  settings: SubagentModelSettings,
  owner: string
): ResolvedSubagentModel {
  if (settings.modelMode !== "custom") {
    return {
      model: input.model,
      streamFn: input.streamFn,
      thinkingLevel: input.thinkingLevel
    };
  }
  const modelId = customModelId(settings);
  if (!modelId) throw new Error(`${owner}未配置模型。`);
  const runtimeConfig = input.subagentRuntimeConfigs?.[modelId];
  if (!runtimeConfig) {
    throw new Error(
      `${owner}配置的模型不可用，请重新保存智能体团队或刷新模型配置。`
    );
  }
  if (!input.buildCustomModelRuntime) {
    throw new Error("当前运行时不支持子智能体单独配置模型。");
  }
  return input.buildCustomModelRuntime(runtimeConfig, {
    ...(settings.thinkingLevel !== undefined
      ? { thinkingLevel: settings.thinkingLevel }
      : {}),
    ...(settings.temperature !== undefined
      ? { temperature: settings.temperature }
      : {})
  });
}

/**
 * The visible turn coordinator owns the complete retry budget. Keep provider
 * SDK retries disabled for inherited and custom child models as well,
 * otherwise one child attempt can fan out into 2+ requests.
 */
export function withoutProviderRetries(streamFn: StreamFn): StreamFn {
  return (requestModel, streamContext, options) =>
    streamFn(requestModel, streamContext, { ...options, maxRetries: 0 });
}
