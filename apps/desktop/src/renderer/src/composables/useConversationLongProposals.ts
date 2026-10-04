import { computed } from "vue";
import type { LongWorkspaceProposalItem } from "./useLongWorkspaceProposals";

const NO_PROPOSALS: readonly LongWorkspaceProposalItem[] = Object.freeze([]);

/** Index once per queue change, retaining unchanged row props. */
export function useConversationLongProposals(
  items: () => readonly LongWorkspaceProposalItem[]
) {
  const byRun = computed(
    (previous?: Map<string, readonly LongWorkspaceProposalItem[]>) => {
      const next = new Map<string, LongWorkspaceProposalItem[]>();
      for (const item of items()) {
        const runId = item.event.payload.runId;
        const group = next.get(runId);
        if (group) group.push(item);
        else next.set(runId, [item]);
      }
      const stable = new Map<string, readonly LongWorkspaceProposalItem[]>();
      for (const [runId, group] of next) {
        const retained = previous?.get(runId);
        stable.set(
          runId,
          retained?.length === group.length &&
            retained.every((item, index) => item === group[index])
            ? retained
            : group
        );
      }
      return stable;
    }
  );

  function proposalsForRun(
    runId: string | undefined
  ): readonly LongWorkspaceProposalItem[] {
    return runId ? (byRun.value.get(runId) ?? NO_PROPOSALS) : NO_PROPOSALS;
  }
  return { proposalsForRun };
}
