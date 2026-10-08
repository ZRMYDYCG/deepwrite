import type { DeepWriteApi } from "@deepwrite/contracts";

/** Serialized into the Renderer to exercise the migrated history over real IPC. */
export async function legacyHistorySmokeInRenderer(phase: string) {
  const api = (globalThis as unknown as { deepwrite: DeepWriteApi }).deepwrite;
  const persistence = api.conversationPersistence;
  const history = persistence?.history;
  if (!persistence || !history) throw new Error("Missing history smoke APIs.");
  const identity = {
    key: "conversation-history:storage-smoke-legacy",
    sessionId: "storage_legacy_session"
  };
  const preferenceKey = "conversation-preferences:storage-smoke-legacy";
  const expected =
    phase === "seed" ? "legacy storage history" : "updated storage history";
  const state = await history.session(identity);
  const messages = await history.messages(identity);
  const preference = await persistence.load(preferenceKey);
  if (
    state?.messageCount !== 1 ||
    messages.messages[0]?.messageId !== "storage_legacy_message" ||
    messages.messages[0]?.value.content !== expected ||
    JSON.stringify(preference) !==
      JSON.stringify({ layout: phase === "seed" ? "legacy" : "updated" })
  ) {
    throw new Error(
      "Storage smoke: old migration lost or replayed live history."
    );
  }
  if (phase === "seed") {
    await history.commit({
      ...identity,
      expectedRevision: state.revision,
      generation: state.generation,
      sequence: state.sequence + 1,
      batchId: "legacy-history-update",
      operations: [
        {
          type: "patchMessage",
          messageId: "storage_legacy_message",
          changes: [
            { op: "set", path: ["content"], value: "updated storage history" }
          ]
        }
      ]
    });
    await persistence.save(preferenceKey, { layout: "updated" });
  }
  return true;
}
