import type { ChatContextCompaction } from "../types/conversation";

/** A prune pass without a reduction and a failed pass have no visible output. */
export function visibleCompaction(item: ChatContextCompaction): boolean {
  return (
    item.status !== "failed" &&
    (item.status !== "completed" ||
      item.level === "summary" ||
      !!item.checkpoint ||
      (item.tokensBefore ?? 0) > (item.tokensAfter ?? 0))
  );
}
