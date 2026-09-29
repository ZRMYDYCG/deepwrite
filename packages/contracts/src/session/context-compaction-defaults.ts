import type { ContextCompactionSettings } from "./context-compaction-state";

export const CONTEXT_CHECKPOINT_SUMMARY_MAX_LENGTH = 40_000;
export const CONTEXT_COMPACTION_INSTRUCTIONS_MAX_LENGTH = 1_000;
export const CONTEXT_COMPACTION_BUDGET_MIN_TOKENS = 16_000;
export const CONTEXT_COMPACTION_BUDGET_MAX_TOKENS = 2_000_000;
export const DEFAULT_CONTEXT_COMPACTION_BUDGET_TOKENS = 160_000;

export function createDefaultContextCompactionSettings(): ContextCompactionSettings {
  return {
    enabled: true,
    showManualButton: false,
    budgetTokens: DEFAULT_CONTEXT_COMPACTION_BUDGET_TOKENS
  };
}
