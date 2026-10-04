import type { DecompositionUsage } from "@deepwrite/contracts";

/**
 * Usage of decomposition runs as Main observes it, per task, until the next
 * control call hands it to Core. Main is the only trusted counter: the
 * Renderer never reports usage, and child and compaction requests are
 * included because they carry the parent run id.
 */
const pending = new Map<string, DecompositionUsage>();

export function recordDecompositionUsage(
  jobId: string,
  usage: {
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
  }
): void {
  const total = pending.get(jobId);
  // Cache writes are uncached input billed once; reads are the cheap repeats.
  pending.set(jobId, {
    inputTokens:
      (total?.inputTokens ?? 0) + usage.inputTokens + usage.cacheWriteTokens,
    cacheReadTokens: (total?.cacheReadTokens ?? 0) + usage.cacheReadTokens,
    outputTokens: (total?.outputTokens ?? 0) + usage.outputTokens,
    requests: (total?.requests ?? 0) + 1
  });
}

export function takeDecompositionUsage(
  jobId: string
): DecompositionUsage | undefined {
  const usage = pending.get(jobId);
  pending.delete(jobId);
  return usage;
}

/** Puts usage back when Core did not accept the control call carrying it. */
export function restoreDecompositionUsage(
  jobId: string,
  usage: DecompositionUsage
): void {
  const total = pending.get(jobId);
  pending.set(
    jobId,
    total
      ? {
          inputTokens: total.inputTokens + usage.inputTokens,
          cacheReadTokens: total.cacheReadTokens + usage.cacheReadTokens,
          outputTokens: total.outputTokens + usage.outputTokens,
          requests: total.requests + usage.requests
        }
      : usage
  );
}
