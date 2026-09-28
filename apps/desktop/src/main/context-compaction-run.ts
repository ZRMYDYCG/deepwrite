import type {
  AgentProviderRuntimeConfig,
  ContextCompactionRunSettings,
  GeneralSettings
} from "@deepwrite/contracts";

export interface ContextCompactionRun {
  contextCompactionSettings: ContextCompactionRunSettings;
  /** Present only when a dedicated summary model is configured and usable. */
  compactionRuntimeConfig?: AgentProviderRuntimeConfig;
}

/**
 * Resolves the user's compaction settings for one conversation run. A missing
 * or deleted summary model falls back to the run model instead of failing.
 */
export async function resolveContextCompactionRun(
  loadSettings: () => Promise<GeneralSettings>,
  resolveModel: (
    modelId: string
  ) => Promise<AgentProviderRuntimeConfig | undefined>,
  runModelId: string | undefined
): Promise<ContextCompactionRun> {
  const { contextCompaction } = await loadSettings();
  const contextCompactionSettings = {
    enabled: contextCompaction.enabled,
    budgetTokens: contextCompaction.budgetTokens
  };
  const modelId = contextCompaction.modelId;
  if (!modelId || modelId === runModelId) return { contextCompactionSettings };
  const compactionRuntimeConfig = await resolveModel(modelId).catch(
    () => undefined
  );
  return compactionRuntimeConfig
    ? { contextCompactionSettings, compactionRuntimeConfig }
    : { contextCompactionSettings };
}

/** Adds the summary model so its usage is priced with its own config. */
export function withCompactionUsageConfig(
  configs: Readonly<Record<string, AgentProviderRuntimeConfig>>,
  compaction: ContextCompactionRun
): Readonly<Record<string, AgentProviderRuntimeConfig>> {
  const config = compaction.compactionRuntimeConfig;
  return config ? { ...configs, [config.id]: config } : configs;
}
