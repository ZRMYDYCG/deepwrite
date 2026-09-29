import {
  chapterEvent,
  continuityWriteEvent,
  describe,
  envelopeContext,
  expect,
  harness,
  it,
  ledgerEvent,
  mutationEvent,
  systemEvent
} from "./useLongWorkspaceProposals.test-support";

describe("long workspace proposal approval: quarantine-deduplication-and-finalization", () => {
  it("deduplicates a replayed tool proposal even when it has a new envelope id", async () => {
    const test = harness();
    const original = ledgerEvent();
    const replay = systemEvent({
      ...original,
      id: "event_ledger_replayed"
    });

    expect(await test.controller.handleEvent(original)).toBe(true);
    expect(await test.controller.handleEvent(replay)).toBe(false);

    expect(test.commitChapter).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        event: { type: "long.ledger_commit_proposal" },
        status: "accepted"
      }
    ]);
  });

  it("quarantines a removed book and rejects late proposal events", async () => {
    const test = harness();
    await test.controller.handleEvent(mutationEvent());
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(1);

    test.controller.discardBook("longbook_test");
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
    expect(await test.controller.handleEvent(continuityWriteEvent())).toBe(
      false
    );
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);

    test.controller.activateBook("longbook_test");
    expect(await test.controller.handleEvent(continuityWriteEvent())).toBe(
      true
    );
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(1);
  });

  it("quarantines a canceled session, removes queued proposals, and rejects late ones", async () => {
    const test = harness();
    await test.controller.handleEvent(continuityWriteEvent());
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(1);

    test.controller.quarantineSession(
      "longbook_test",
      envelopeContext.sessionId
    );
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
    expect(await test.controller.handleEvent(continuityWriteEvent())).toBe(
      false
    );
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);

    const originalContinuityEvent = continuityWriteEvent();
    const otherSessionEvent = systemEvent({
      ...originalContinuityEvent,
      id: "event_continuity_other_session",
      context: {
        ...originalContinuityEvent.context,
        sessionId: "session_long_other"
      },
      payload: {
        ...originalContinuityEvent.payload,
        sessionId: "session_long_other",
        toolCallId: "tool_continuity_other_session"
      }
    });
    expect(await test.controller.handleEvent(otherSessionEvent)).toBe(true);
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(1);
  });

  it("coalesces duplicate preview retries while one retry is in flight", async () => {
    const test = harness();
    test.previewOperations.mockRejectedValueOnce(new Error("首次预览失败"));
    await test.controller.handleEvent(mutationEvent());
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "error"
    });

    const firstRetry = test.controller.retryPreview(
      "longbook_test",
      "event_mutation"
    );
    const duplicateRetry = test.controller.retryPreview(
      "longbook_test",
      "event_mutation"
    );
    await Promise.all([firstRetry, duplicateRetry]);

    expect(test.previewOperations).toHaveBeenCalledTimes(2);
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "ready"
    });
  });

  it("routes chapter drafts away and finalizes continuity on its dedicated API", async () => {
    const test = harness();
    expect(await test.controller.handleEvent(chapterEvent())).toBe(false);
    await test.controller.handleEvent(ledgerEvent());

    expect(test.writeChapter).not.toHaveBeenCalled();
    expect(test.commitChapter).toHaveBeenCalledWith(
      expect.objectContaining({ chapterCardId: "chapter_one" })
    );
    expect(test.onApplied).toHaveBeenCalledTimes(1);
    expect(test.notifications.error).not.toHaveBeenCalled();
  });

  it("waits for file approval while showing continuity finalization status", async () => {
    const test = harness();
    await test.controller.handleEvent(continuityWriteEvent());
    await test.controller.handleEvent(ledgerEvent());

    expect(test.commitChapter).not.toHaveBeenCalled();
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(2);
    expect(
      test.controller
        .itemsForBook("longbook_test")
        .find(({ event }) => event.type === "long.ledger_commit_proposal")
    ).toMatchObject({ status: "waiting" });

    await test.controller.approve("longbook_test", "event_continuity_file");

    expect(test.notifications.error).not.toHaveBeenCalled();
    expect(test.commitChapter).toHaveBeenCalledTimes(1);
    expect(test.onApplied).toHaveBeenCalledTimes(2);
    expect(test.onApplied).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "long.ledger_commit_proposal" })
    );
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      { status: "accepted" },
      { status: "accepted" }
    ]);
  });

  it("does not turn a post-write refresh failure into a retryable write", async () => {
    const test = harness();
    test.onApplied.mockRejectedValueOnce(new Error("刷新超时"));
    await test.controller.handleEvent(ledgerEvent());

    expect(test.commitChapter).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      { status: "accepted" }
    ]);
    expect(test.notifications.success).toHaveBeenCalledWith(
      "本章连续性文件已完成归档。"
    );
    expect(test.notifications.warning).toHaveBeenCalledWith(
      "连续性文件已经归档，但后续刷新失败：刷新超时"
    );
    expect(test.notifications.error).not.toHaveBeenCalled();

    await test.controller.handleEvent(ledgerEvent());
    expect(test.commitChapter).toHaveBeenCalledTimes(1);
  });

  it("does not offer an endless retry when a v4 audit mismatch escapes repair", async () => {
    const test = harness();
    test.commitChapter.mockRejectedValueOnce({
      code: "long.ledger.audit_failed",
      message: "Ledger file list does not match chapter index: commit_old.",
      details: { commitId: "commit_old" }
    });

    await test.controller.handleEvent(ledgerEvent());

    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        event: { type: "long.ledger_commit_proposal" },
        status: "error",
        error: "连续性账本与当前章节不一致，请刷新工作区并核对后重试。",
        errorRetryable: false
      }
    ]);
    expect(test.commitChapter).toHaveBeenCalledTimes(1);

    expect(test.controller.reject("longbook_test", "event_ledger")).toBe(true);
    expect(test.commitChapter).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
  });
});
