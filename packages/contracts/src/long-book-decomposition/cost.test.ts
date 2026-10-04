import { describe, expect, it } from "vitest";
import {
  decompositionChaptersPerSubmission,
  decompositionChildContextBudget,
  decompositionEvidenceBudget
} from "./chunking";
import { estimateDecomposition } from "./estimate";
import { addDecompositionUsage, decompositionUsageTotal } from "./usage";

describe("decomposition cost model", () => {
  it("sizes child budgets as shares of the model window", () => {
    const small = { contextWindow: 128_000, maxTokens: 8192 };
    const large = { contextWindow: 1_050_000, maxTokens: 128_000 };
    expect(decompositionChildContextBudget(small)).toBe(102_400);
    expect(decompositionChildContextBudget(large)).toBe(840_000);
    expect(decompositionEvidenceBudget(large)).toBeGreaterThan(
      decompositionEvidenceBudget(small) * 8
    );
    expect(decompositionChaptersPerSubmission(small)).toBe(1);
    expect(decompositionChaptersPerSubmission(large)).toBe(6);
  });

  it("counts every re-sent turn, so a 1.2M-character book lands in the tens of millions", () => {
    // Shape of the trial that actually consumed 569M input tokens.
    const estimate = estimateDecomposition(201, 1_213_191, 33);
    expect(estimate.inputTokens[0]).toBeGreaterThan(3_000_000);
    expect(estimate.inputTokens[1]).toBeLessThan(60_000_000);
    expect(estimate.cachedInputTokens[1]).toBeLessThan(estimate.inputTokens[1]);
    expect(estimate.calls).toBeGreaterThan(33 * 2);
  });

  it("adds usage with cache reads counted as processed input", () => {
    const total = addDecompositionUsage(
      addDecompositionUsage(undefined, {
        inputTokens: 100,
        cacheReadTokens: 900,
        outputTokens: 10,
        requests: 1
      }),
      { inputTokens: 50, cacheReadTokens: 0, outputTokens: 5, requests: 1 }
    );
    expect(total).toEqual({
      inputTokens: 150,
      cacheReadTokens: 900,
      outputTokens: 15,
      requests: 2
    });
    expect(decompositionUsageTotal(total)).toBe(1065);
  });
});
