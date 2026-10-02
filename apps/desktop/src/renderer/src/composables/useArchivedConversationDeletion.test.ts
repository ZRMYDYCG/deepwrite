import type {
  ConversationHistoryApi,
  ConversationHistoryPurgeQuery
} from "@deepwrite/contracts";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uiMessage } from "../ui-feedback";
import {
  useArchivedConversationDeletion,
  type ArchivedConversationEntry
} from "./useArchivedConversationDeletion";

vi.mock("../ui-feedback", () => ({
  uiMessage: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

function entry(sessionId: string): ArchivedConversationEntry {
  return {
    key: "conversation-history:fixture",
    sessionId,
    revision: 2,
    title: sessionId,
    preview: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messageCount: 1,
    turnCount: 1,
    current: false
  };
}

function setup(loaded: ArchivedConversationEntry[]) {
  const items = ref(loaded);
  const api = {
    purge: vi.fn(async (_query: ConversationHistoryPurgeQuery) => ({
      deleted: true as const
    })),
    listArchived: vi.fn()
  };
  const reload = vi.fn(async () => {});
  const state = useArchivedConversationDeletion({
    items,
    getApi: () => api as unknown as ConversationHistoryApi,
    reload
  });
  return { items, api, reload, state };
}

beforeEach(() => vi.clearAllMocks());

describe("archived conversation bulk deletion", () => {
  it("deletes only selected loaded conversations after confirmation", async () => {
    const fixture = setup([entry("first"), entry("second"), entry("third")]);
    fixture.state.toggleSelection(fixture.items.value[0]!);
    fixture.state.toggleSelection(fixture.items.value[2]!);
    expect(fixture.state.selectedItems.value).toHaveLength(2);
    fixture.state.requestSelected();
    expect(fixture.state.pendingDelete.value).toMatchObject({
      kind: "selected",
      items: [{ sessionId: "first" }, { sessionId: "third" }]
    });
    await fixture.state.confirmDelete();
    expect(
      fixture.api.purge.mock.calls.map(([query]) => query.sessionId)
    ).toEqual(["first", "third"]);
    expect(fixture.items.value.map((item) => item.sessionId)).toEqual([
      "second"
    ]);
    expect(fixture.state.selectedItems.value).toHaveLength(0);
    expect(fixture.reload).toHaveBeenCalledOnce();
    expect(uiMessage.success).toHaveBeenCalledWith(
      expect.stringContaining("2")
    );
  });

  it("deletes every archived conversation across pages, including unloaded rows", async () => {
    const fixture = setup([entry("session-0")]);
    const cursor = {
      updatedAt: "2026-01-01T00:00:00.000Z",
      key: "conversation-history:fixture",
      sessionId: "session-99"
    };
    fixture.api.listArchived
      .mockResolvedValueOnce({
        entries: Array.from({ length: 100 }, (_, index) => ({
          key: "conversation-history:fixture",
          session: { sessionId: `session-${index}`, revision: 2 }
        })),
        next: cursor
      })
      .mockResolvedValueOnce({
        entries: [
          {
            key: "conversation-history:fixture",
            session: { sessionId: "session-100", revision: 2 }
          }
        ],
        next: null
      });
    fixture.state.requestAll();
    await fixture.state.confirmDelete();
    expect(fixture.api.listArchived).toHaveBeenNthCalledWith(1, { limit: 100 });
    expect(fixture.api.listArchived).toHaveBeenNthCalledWith(2, {
      after: cursor,
      limit: 100
    });
    expect(fixture.api.purge).toHaveBeenCalledTimes(101);
    expect(fixture.api.purge).toHaveBeenLastCalledWith({
      key: "conversation-history:fixture",
      sessionId: "session-100",
      expectedRevision: 2
    });
  });

  it("continues after one deletion fails and reports the partial result", async () => {
    const fixture = setup([entry("first"), entry("second"), entry("third")]);
    fixture.api.purge.mockImplementation(async ({ sessionId }) => {
      if (sessionId === "second") throw new Error("revision changed");
      return { deleted: true as const };
    });
    fixture.state.toggleLoadedSelection();
    fixture.state.requestSelected();
    await fixture.state.confirmDelete();
    expect(fixture.api.purge).toHaveBeenCalledTimes(3);
    expect(fixture.items.value.map((item) => item.sessionId)).toEqual([
      "second"
    ]);
    expect(uiMessage.error).toHaveBeenCalledWith(expect.stringContaining("1"));
  });

  it("reports completed deletions if reading the next page fails", async () => {
    const fixture = setup([entry("first")]);
    const cursor = {
      updatedAt: "2026-01-01T00:00:00.000Z",
      key: "conversation-history:fixture",
      sessionId: "first"
    };
    fixture.api.listArchived
      .mockResolvedValueOnce({
        entries: [
          {
            key: "conversation-history:fixture",
            session: { sessionId: "first", revision: 2 }
          }
        ],
        next: cursor
      })
      .mockRejectedValueOnce(new Error("read failed"));
    fixture.state.requestAll();
    await fixture.state.confirmDelete();
    expect(fixture.api.purge).toHaveBeenCalledOnce();
    expect(fixture.reload).toHaveBeenCalledOnce();
    expect(uiMessage.error).toHaveBeenCalledWith(expect.stringContaining("1"));
  });

  it("does not delete a conversation when confirmation is canceled", async () => {
    const fixture = setup([entry("first")]);
    fixture.state.requestOne(fixture.items.value[0]!);
    fixture.state.pendingDelete.value = null;
    await fixture.state.confirmDelete();
    expect(fixture.api.purge).not.toHaveBeenCalled();
  });
});
