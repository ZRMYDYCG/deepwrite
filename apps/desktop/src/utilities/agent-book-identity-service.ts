import {
  CommandEnvelopeSchema,
  createEnvelope,
  BookIdentityRoundReceiptSchema,
  chatAssistantProjectKey,
  type BookIdentitySubmitInput
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";
import type { UtilityCommandHandlerContext } from "./runtime";

export function createBookIdentityService(
  context: UtilityCommandHandlerContext,
  sessionId: string,
  runId: string
) {
  return {
    bookIdentitySubmit: async (input: BookIdentitySubmitInput) => {
      const id = createId("cmd_book_identity_submit");
      const command = CommandEnvelopeSchema.parse(
        createEnvelope("bookIdentity.submitRound", input, {
          id,
          context: {
            sessionId,
            runId,
            resourceId: chatAssistantProjectKey(input.book),
            correlationId: id
          }
        })
      );
      const result = await context.requestInternalCommand("core", command, {
        timeoutMs: 120_000
      });
      if (result.status !== "accepted") throw new Error(result.error.message);
      return BookIdentityRoundReceiptSchema.parse(result.payload);
    }
  };
}
