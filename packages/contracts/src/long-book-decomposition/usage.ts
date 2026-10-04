import { estimateDecomposition } from "./estimate";
import type { LongBookDecompositionJob } from "./job";
import { DECOMPOSITION_USAGE_LIMIT_FACTOR } from "./limits";
import type { DecompositionUsage } from "./usage-schema";

export function addDecompositionUsage(
  total: DecompositionUsage | undefined,
  next: DecompositionUsage
): DecompositionUsage {
  return {
    inputTokens: (total?.inputTokens ?? 0) + next.inputTokens,
    cacheReadTokens: (total?.cacheReadTokens ?? 0) + next.cacheReadTokens,
    outputTokens: (total?.outputTokens ?? 0) + next.outputTokens,
    requests: (total?.requests ?? 0) + next.requests
  };
}

/** Every token processed: uncached input, cache reads and output. */
export function decompositionUsageTotal(
  usage: DecompositionUsage | undefined
): number {
  return usage
    ? usage.inputTokens + usage.cacheReadTokens + usage.outputTokens
    : 0;
}

/**
 * The task pauses for the user's go-ahead past this many tokens: the high
 * estimate times a margin, or the higher limit the user accepted.
 */
export function decompositionUsageLimit(job: LongBookDecompositionJob): number {
  if (job.usageLimitTokens) return job.usageLimitTokens;
  const estimate = estimateDecomposition(
    job.source.chapterCount,
    job.source.characterCount,
    job.chunks.length
  );
  return Math.ceil(
    (estimate.inputTokens[1] + estimate.outputTokens[1]) *
      DECOMPOSITION_USAGE_LIMIT_FACTOR
  );
}
