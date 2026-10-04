import {
  CommandEnvelopeSchema,
  createEnvelope,
  type ChatAssistantProjectRef,
  type CommandEnvelope,
  type CommandResult
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";

export type IdentityCore = (command: CommandEnvelope) => Promise<CommandResult>;

export async function identityCore(
  core: IdentityCore,
  type: CommandEnvelope["type"],
  payload: unknown,
  book: ChatAssistantProjectRef
): Promise<unknown> {
  const id = createId("cmd_book_identity_core");
  const result = await core(
    CommandEnvelopeSchema.parse(
      createEnvelope(type, payload, {
        id,
        correlationId: id,
        context: { resourceId: book.projectId }
      })
    )
  );
  if (result.status === "rejected") throw new Error(result.error.message);
  return result.payload;
}
