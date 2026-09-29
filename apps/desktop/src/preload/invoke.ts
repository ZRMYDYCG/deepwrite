import { ipcRenderer } from "electron";
import {
  CommandResultSchema,
  IPC_COMMAND_CHANNEL,
  type CommandEnvelope
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";

export function browserId(prefix: string): string {
  return createId(prefix);
}

export async function invokeCommand<TPayload>(
  command: CommandEnvelope
): Promise<TPayload> {
  const expectedRequestId = command.id;
  const result = CommandResultSchema.parse(
    await ipcRenderer.invoke(IPC_COMMAND_CHANNEL, command)
  );
  if (result.requestId !== expectedRequestId) {
    // Prefer the real rejection reason when main returned requestId "unknown"
    // (or another mismatched id) for an invalid/untrusted command.
    if (result.status === "rejected") {
      throw result.error;
    }
    throw new Error(
      `IPC result requestId does not match command id. expected=${expectedRequestId} actual=${result.requestId}`
    );
  }
  if (result.status === "rejected") {
    throw result.error;
  }
  return result.payload as TPayload;
}
