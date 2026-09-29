import type { LongWorkspaceImpactConfirmation } from "@deepwrite/contracts";
import {
  SystemEventEnvelopeSchema,
  createEnvelope,
  describe,
  emptyConfirmation,
  envelopeContext,
  expect,
  harness,
  it,
  ledgerEvent,
  mutationEvent,
  proposalBase,
  systemEvent
} from "./useLongWorkspaceProposals.test-support";

function previewResult(confirmation: LongWorkspaceImpactConfirmation) {
  return {
    bookId: proposalBase.bookId,
    preview: {
      ...confirmation,
      confirmation,
      documentWrites: [],
      provisionalIdMap: {}
    }
  };
}

function deleteMutationEvent() {
  return systemEvent(
    createEnvelope(
      "long.mutation_proposal",
      {
        ...proposalBase,
        summary: "删除世界观分类",
        batch: {
          updatedAt: "2026-07-26T12:00:00.000Z",
          operations: [{ type: "worldbuilding.delete", id: "world_rules" }],
          documentWrites: []
        }
      },
      { id: "event_delete_mutation", context: envelopeContext }
    )
  );
}

describe("long workspace proposal approval: structure and manual proposals", () => {
  it("applies the exact impact confirmation already shown to the user", async () => {
    const test = harness();
    await test.controller.handleEvent(mutationEvent());

    expect(test.previewOperations).toHaveBeenCalledTimes(1);
    await test.controller.approve("longbook_test", "event_mutation");

    expect(test.previewOperations).toHaveBeenCalledTimes(1);
    expect(test.applyOperations).toHaveBeenCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({ expectedImpact: emptyConfirmation })
    });
    expect(test.controller.itemsForBook("longbook_test")[0]?.status).toBe(
      "accepted"
    );
  });

  it("refreshes changed impact and requires a second confirmation", async () => {
    const changedConfirmation: LongWorkspaceImpactConfirmation = {
      ...emptyConfirmation,
      impact: {
        ...emptyConfirmation.impact,
        updatedEntityIds: ["world_related", "world_rules"]
      }
    };
    const test = harness();
    test.previewOperations
      .mockResolvedValueOnce(previewResult(emptyConfirmation))
      .mockResolvedValueOnce(previewResult(changedConfirmation));
    test.applyOperations.mockRejectedValueOnce({
      code: "long.operation.impact_mismatch",
      message: "删除影响已变化"
    });

    await test.controller.handleEvent(mutationEvent());
    await test.controller.approve("longbook_test", "event_mutation");

    expect(test.applyOperations).toHaveBeenCalledTimes(1);
    expect(test.previewOperations).toHaveBeenCalledTimes(2);
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "ready",
      approvalMode: "request-approval",
      preview: { confirmation: changedConfirmation }
    });

    test.applyOperations.mockResolvedValueOnce(undefined);
    await test.controller.approve("longbook_test", "event_mutation");
    expect(
      test.controller.itemsForBook("longbook_test")[0]?.error
    ).toBeUndefined();
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "accepted"
    });
    expect(test.applyOperations).toHaveBeenCalledTimes(2);
    expect(test.applyOperations).toHaveBeenLastCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({ expectedImpact: changedConfirmation })
    });
  });

  it("never auto-approves a proposal that deletes entities", async () => {
    const test = harness(true, "auto-approve");

    await test.controller.handleEvent(deleteMutationEvent());

    expect(test.applyOperations).not.toHaveBeenCalled();
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "ready",
      approvalMode: "request-approval",
      preview: { confirmation: emptyConfirmation }
    });
  });

  it("marks deterministic preview validation failures as non-retryable", async () => {
    const test = harness();
    test.previewOperations.mockRejectedValueOnce({
      code: "long.operation.invalid_reference",
      message: "invalid target"
    });

    await test.controller.handleEvent(mutationEvent());

    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "error",
      errorPhase: "preview",
      errorRetryable: false
    });
    expect(test.applyOperations).not.toHaveBeenCalled();
  });

  it("treats the retired long conflict prefix as an ordinary retryable failure", async () => {
    const test = harness();
    test.previewOperations.mockRejectedValueOnce(
      new Error("long.conflict: temporary preview failure")
    );

    await test.controller.handleEvent(mutationEvent());

    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "error",
      errorPhase: "preview",
      errorRetryable: true
    });

    await test.controller.retryPreview("longbook_test", "event_mutation");
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "ready"
    });
  });

  it("enqueues schema-valid manual mutations through preview and approval", async () => {
    const test = harness(false);
    const event = await test.controller.enqueueManualMutation({
      bookId: proposalBase.bookId,
      batch: mutationEvent().payload.batch,
      summary: "手工调整世界观结构"
    });

    expect(SystemEventEnvelopeSchema.safeParse(event).success).toBe(true);
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      event: { id: event.id },
      status: "ready"
    });

    await test.controller.approve("longbook_test", event.id);
    expect(test.applyOperations).toHaveBeenCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({ expectedImpact: emptyConfirmation })
    });
  });

  it("keeps continuity finalization in the queue as an accepted record", async () => {
    const test = harness();
    await test.controller.handleEvent(ledgerEvent());

    expect(test.commitChapter).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      { event: { type: "long.ledger_commit_proposal" }, status: "accepted" }
    ]);
  });
});
