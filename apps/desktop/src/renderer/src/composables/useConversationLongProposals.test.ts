import { createEnvelope } from "@deepwrite/contracts/renderer";
import { computed, ref, shallowReactive, watchEffect } from "vue";
import { describe, expect, it, vi } from "vitest";
import { approvalItemsForMessage } from "../components/conversationToolPresentation";
import type { ChatMessage } from "../types/conversation";
import { useConversationLongProposals } from "./useConversationLongProposals";
import type { LongWorkspaceProposalItem } from "./useLongWorkspaceProposals";

const createdAt = "2026-10-02T00:00:00.000Z";

function proposal(id: string, runId: string): LongWorkspaceProposalItem {
  return {
    approvalMode: "request-approval",
    status: "ready",
    event: createEnvelope(
      "long.mutation_proposal",
      {
        sessionId: "session-test",
        runId,
        toolCallId: `tool-${id}`,
        bookId: "book-test",
        agentId: "long",
        summary: id,
        runtime: { provider: "deepwrite", model: "faux", mode: "local-faux" },
        batch: { updatedAt: createdAt, operations: [], documentWrites: [] }
      },
      { id, timestamp: createdAt }
    )
  };
}

describe("conversation proposal projection", () => {
  it("keeps proposal order and excludes other runs and messages without a run", () => {
    const first = proposal("proposal-first", "run-1");
    const second = proposal("proposal-second", "run-1");
    const other = proposal("proposal-other", "run-2");
    const { proposalsForRun } = useConversationLongProposals(() => [
      first,
      other,
      second
    ]);

    expect(proposalsForRun("run-1")).toEqual([first, second]);
    expect(proposalsForRun("run-2")).toEqual([other]);
    expect(proposalsForRun(undefined)).toEqual([]);
    expect(proposalsForRun("absent")).toBe(proposalsForRun(undefined));
  });

  it("retains untouched row inputs when a different run's proposal is replaced", () => {
    const items = ref([proposal("first", "run-1"), proposal("other", "run-2")]);
    const { proposalsForRun } = useConversationLongProposals(() => items.value);
    const first = proposalsForRun("run-1");
    const other = proposalsForRun("run-2");

    items.value = [items.value[0]!, { ...items.value[1]!, status: "accepted" }];

    expect(proposalsForRun("run-1")).toBe(first);
    expect(proposalsForRun("run-2")).not.toBe(other);
    expect(proposalsForRun("run-2")[0]?.status).toBe("accepted");
    items.value[0]!.status = "submitting";
    expect(proposalsForRun("run-1")).toBe(first);
    expect(first[0]?.status).toBe("submitting");
  });

  it("invalidates moved, reordered and removed proposals without retaining old queue entries", () => {
    const items = ref([
      proposal("first", "run-1"),
      proposal("second", "run-1")
    ]);
    const { proposalsForRun } = useConversationLongProposals(() => items.value);
    const original = proposalsForRun("run-1");
    items.value.reverse();
    expect(proposalsForRun("run-1")).not.toBe(original);
    expect(proposalsForRun("run-1").map(({ event }) => event.id)).toEqual([
      "second",
      "first"
    ]);

    items.value[0]!.event.payload.runId = "run-2";
    expect(proposalsForRun("run-1").map(({ event }) => event.id)).toEqual([
      "first"
    ]);
    expect(proposalsForRun("run-2").map(({ event }) => event.id)).toEqual([
      "second"
    ]);
    items.value = [];
    expect(proposalsForRun("run-1")).toEqual([]);
    expect(proposalsForRun("run-2")).toEqual([]);
  });

  it("recomputes one approval projection for a one-run update across 1000 mounted rows", () => {
    const items = ref(
      Array.from({ length: 1000 }, (_, index) =>
        proposal(`proposal-${index}`, `run-${index}`)
      )
    );
    const { proposalsForRun } = useConversationLongProposals(() => items.value);
    // Model Vue's row prop boundary: unchanged arrays do not invalidate child
    // computed projections, even when the parent walks the entire message list.
    const rows = items.value.map((item, index) => {
      const message: ChatMessage = {
        id: `message-${index}`,
        runId: item.event.payload.runId,
        role: "assistant",
        content: "已完成",
        status: "completed",
        createdAt
      };
      const props = shallowReactive({ items: proposalsForRun(message.runId) });
      const derive = vi.fn(() => approvalItemsForMessage(message, props.items));
      return { message, props, derive, approval: computed(derive) };
    });
    const stop = watchEffect(
      () => {
        for (const row of rows)
          row.props.items = proposalsForRun(row.message.runId);
      },
      { flush: "sync" }
    );
    try {
      for (const [index, row] of rows.entries()) {
        expect(row.approval.value).toHaveLength(1);
        expect(row.approval.value[0]?.id).toBe(`long:proposal-${index}`);
      }
      items.value = items.value.map((item, index) =>
        index === 500 ? { ...item, status: "accepted" } : item
      );
      for (const row of rows) void row.approval.value;

      expect(
        rows.reduce((total, row) => total + row.derive.mock.calls.length, 0)
      ).toBe(1001);
      expect(rows[500]!.approval.value[0]).toMatchObject({
        item: { status: "accepted" }
      });
    } finally {
      stop();
    }
  });
});
