import {
  BookIdentityBookInputSchema,
  BookIdentityAddManualCandidateInputSchema,
  BookIdentityUpdateCandidateInputSchema,
  BookIdentityAdoptInputSchema,
  BookIdentityClearAdoptionInputSchema,
  BookIdentityDeleteRoundInputSchema,
  BookIdentityPruneRoundsInputSchema,
  BookIdentityRenderCoverInputSchema,
  BookIdentityCancelRenderInputSchema,
  BookIdentityCancelRenderResultSchema,
  BookIdentitySaveComposedCoverInputSchema,
  BookIdentityExportCoverInputSchema,
  BookIdentityExportCoverResultSchema,
  BookIdentityRecordSchema,
  BookCoverCandidateSchema,
  createEnvelope,
  CommandEnvelopeSchema,
  type BookIdentityApi,
  type CommandEnvelope
} from "@deepwrite/contracts";
import { browserId, invokeCommand } from "./invoke";

async function identityInvoke(
  type: CommandEnvelope["type"],
  payload: unknown
): Promise<unknown> {
  const id = browserId("cmd_book_identity");
  return invokeCommand(
    CommandEnvelopeSchema.parse(
      createEnvelope(type, payload, { id, correlationId: id })
    )
  );
}

export const bookIdentity: BookIdentityApi = {
  async get(input) {
    return BookIdentityRecordSchema.parse(
      await identityInvoke(
        "bookIdentity.get",
        BookIdentityBookInputSchema.parse(input)
      )
    );
  },
  async inheritBook(input) {
    return BookIdentityRecordSchema.parse(
      await identityInvoke(
        "bookIdentity.inheritBook",
        BookIdentityBookInputSchema.parse(input)
      )
    );
  },
  async addManualCandidate(input) {
    return BookIdentityRecordSchema.parse(
      await identityInvoke(
        "bookIdentity.addManualCandidate",
        BookIdentityAddManualCandidateInputSchema.parse(input)
      )
    );
  },
  async updateCandidate(input) {
    return BookIdentityRecordSchema.parse(
      await identityInvoke(
        "bookIdentity.updateCandidate",
        BookIdentityUpdateCandidateInputSchema.parse(input)
      )
    );
  },
  async adopt(input) {
    return BookIdentityRecordSchema.parse(
      await identityInvoke(
        "bookIdentity.adopt",
        BookIdentityAdoptInputSchema.parse(input)
      )
    );
  },
  async clearAdoption(input) {
    return BookIdentityRecordSchema.parse(
      await identityInvoke(
        "bookIdentity.clearAdoption",
        BookIdentityClearAdoptionInputSchema.parse(input)
      )
    );
  },
  async deleteRound(input) {
    return BookIdentityRecordSchema.parse(
      await identityInvoke(
        "bookIdentity.deleteRound",
        BookIdentityDeleteRoundInputSchema.parse(input)
      )
    );
  },
  async pruneRounds(input) {
    return BookIdentityRecordSchema.parse(
      await identityInvoke(
        "bookIdentity.pruneRounds",
        BookIdentityPruneRoundsInputSchema.parse(input)
      )
    );
  },
  async renderCover(input) {
    return BookCoverCandidateSchema.parse(
      await identityInvoke(
        "bookIdentity.renderCover",
        BookIdentityRenderCoverInputSchema.parse(input)
      )
    );
  },
  async cancelRender(input) {
    BookIdentityCancelRenderResultSchema.parse(
      await identityInvoke(
        "bookIdentity.cancelRender",
        BookIdentityCancelRenderInputSchema.parse(input)
      )
    );
  },
  async saveComposedCover(input) {
    return BookIdentityRecordSchema.parse(
      await identityInvoke(
        "bookIdentity.saveComposedCover",
        BookIdentitySaveComposedCoverInputSchema.parse(input)
      )
    );
  },
  async exportCover(input) {
    const result = BookIdentityExportCoverResultSchema.parse(
      await identityInvoke(
        "bookIdentity.exportCover",
        BookIdentityExportCoverInputSchema.parse(input)
      )
    );
    return {
      cancelled: result.cancelled,
      ...(result.path ? { path: result.path } : {})
    };
  }
};
