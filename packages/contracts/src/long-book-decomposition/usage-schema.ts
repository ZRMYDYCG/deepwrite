import { z } from "zod";

const count = z.number().int().nonnegative();
/** Token totals Main observed for a task; cache reads are part of input. */
export const DecompositionUsageSchema = z.object({
  inputTokens: count,
  cacheReadTokens: count,
  outputTokens: count,
  requests: count
});
export type DecompositionUsage = z.infer<typeof DecompositionUsageSchema>;
