/**
 * What one model response can hold. Reasoning and the visible answer (tool
 * arguments included) share the response limit, so every decomposition
 * output that must arrive in one call is sized from the share left after
 * reasoning — never from a fixed count. A response cut at the limit saves
 * nothing, and retrying the same request only repeats the cut.
 */
export interface DecompositionModelCapacity {
  contextWindow?: number | undefined;
  maxTokens?: number | undefined;
  thinkingLevel?: string | undefined;
}

/** Share of the response limit left to reasoning at each thinking level. */
const REASONING_SHARE: Record<string, number> = {
  off: 0.1,
  minimal: 0.25,
  low: 0.35,
  medium: 0.5,
  high: 0.6,
  xhigh: 0.7,
  max: 0.75
};
/** Custom levels are unknown, so they reason like `high`. */
const CUSTOM_REASONING_SHARE = 0.6;
/** Response limit assumed when the model configuration has none. */
export const DECOMPOSITION_DEFAULT_MAX_TOKENS = 4096;
/**
 * Upper bound of one call's visible output whatever the configuration says:
 * providers often enforce less than the configured limit, and very long
 * answers are slow and fragile.
 */
export const DECOMPOSITION_CALL_OUTPUT_CEILING = 16_000;
const CALL_OUTPUT_FLOOR = 800;

/** Visible tokens one response may spend after reasoning takes its share. */
export function decompositionCallOutputTokens(
  model: DecompositionModelCapacity
): number {
  const limit = model.maxTokens ?? DECOMPOSITION_DEFAULT_MAX_TOKENS;
  const share =
    REASONING_SHARE[model.thinkingLevel ?? "medium"] ?? CUSTOM_REASONING_SHARE;
  return Math.max(
    CALL_OUTPUT_FLOOR,
    Math.min(DECOMPOSITION_CALL_OUTPUT_CEILING, Math.floor(limit * (1 - share)))
  );
}

/**
 * Approximate visible tokens of one item of each list output, JSON included.
 * Batch sizes divide the call budget by these, so a smaller model or a higher
 * thinking level gets smaller batches automatically.
 */
const ITEM_TOKENS = {
  /** A saved chapter reading card. */
  readingChapter: 4000,
  /** One name decision inside a compact registry plan. */
  registryName: 10,
  /** One candidate cluster decision of the registry merge. */
  registryCluster: 40,
  /** Chronicle text per chapter of a segment. */
  chronicleChapter: 80,
  foreshadowingLine: 600,
  worldItem: 400,
  reviewIssue: 250,
  styleExcerpt: 350
} as const;
export type DecompositionOutputItem = keyof typeof ITEM_TOKENS;

/** Items of one kind that fit in one call, leaving room for the rest of it. */
export function decompositionBatchLimit(
  model: DecompositionModelCapacity,
  item: DecompositionOutputItem
): number {
  return Math.max(
    1,
    Math.floor(
      (decompositionCallOutputTokens(model) * 0.85) / ITEM_TOKENS[item]
    )
  );
}

/** Characters of prose one call can carry, about one token per Han character. */
export function decompositionProseCharacters(
  model: DecompositionModelCapacity
): number {
  return Math.floor(decompositionCallOutputTokens(model) * 0.75);
}

/**
 * Names one registry part may hold. A part is decided in one call, and the
 * reasoning over its names grows with them, so the plan stays well inside
 * the call budget and a part never exceeds a few hundred names.
 */
export function decompositionRegistryPartNames(
  model: DecompositionModelCapacity
): number {
  return Math.max(
    60,
    Math.min(600, decompositionBatchLimit(model, "registryName"))
  );
}
