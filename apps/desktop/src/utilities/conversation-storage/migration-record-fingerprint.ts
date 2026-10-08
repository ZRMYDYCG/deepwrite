import { createHash } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import type { JsonNodes, ValueRef } from "./json-nodes";
import { ConversationStorageError } from "./errors";

/** Validate and fingerprint a record without materializing its long fields. */
export async function migrationRecordFingerprint(
  nodes: JsonNodes,
  ref: ValueRef
): Promise<string> {
  const hash = createHash("sha256");
  let bytes = 0;
  let sinceYield = 0;
  for (const part of nodes.jsonParts(ref)) {
    hash.update(part);
    const count = Buffer.byteLength(part);
    bytes += count;
    sinceYield += count;
    if (sinceYield >= 1024 * 1024) {
      await setImmediate();
      sinceYield = 0;
    }
  }
  if (bytes !== ref.bytes)
    throw new ConversationStorageError(
      "migration_record_mismatch",
      "History record failed its migration size check."
    );
  return hash.digest("hex");
}
