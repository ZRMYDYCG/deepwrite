import type { DatabaseSync } from "node:sqlite";
import type {
  ConversationHistoryPurgeQuery,
  ConversationHistoryPurgeResult
} from "@deepwrite/contracts";
import type { Statements } from "./schema";
import type { JsonNodes, ValueRef } from "./json-nodes";
import type { MessageRecords } from "./message-records";
import { ConversationStorageError } from "./errors";

/** Delete an archived session atomically, retaining only its non-content tombstone. */
export function purgeArchivedConversation(
  database: DatabaseSync,
  sql: Statements,
  nodes: JsonNodes,
  records: MessageRecords,
  query: ConversationHistoryPurgeQuery,
  assertWriter: () => void
): ConversationHistoryPurgeResult {
  database.exec("BEGIN IMMEDIATE");
  try {
    assertWriter();
    const row = sql
      .get(
        "SELECT revision, deleted, metadata_ref FROM sessions WHERE scope_key = ? AND session_id = ?"
      )
      .get(query.key, query.sessionId);
    if (!row) {
      if (
        sql
          .get(
            "SELECT 1 FROM purged_sessions WHERE scope_key = ? AND session_id = ?"
          )
          .get(query.key, query.sessionId)
      ) {
        database.exec("COMMIT");
        return { deleted: true };
      }
      throw new ConversationStorageError(
        "session_not_archived",
        "Only archived conversations can be permanently deleted."
      );
    }
    if (!row.deleted)
      throw new ConversationStorageError(
        "session_not_archived",
        "Only archived conversations can be permanently deleted."
      );
    if (Number(row.revision) !== query.expectedRevision)
      throw new ConversationStorageError(
        "revision_conflict",
        "Conversation changed before permanent deletion."
      );
    if (
      sql
        .get(
          "SELECT 1 FROM messages WHERE scope_key = ? AND session_id = ? AND (running = 1 OR pending = 1) LIMIT 1"
        )
        .get(query.key, query.sessionId)
    )
      throw new ConversationStorageError(
        "session_busy",
        "Finish pending work before permanently deleting this conversation."
      );
    const messages = sql
      .get(
        "SELECT message_id FROM messages WHERE scope_key = ? AND session_id = ?"
      )
      .all(query.key, query.sessionId);
    for (const message of messages)
      records.remove(query.key, query.sessionId, String(message.message_id));
    const stages = sql
      .get(
        "SELECT value_ref FROM stages WHERE scope_key = ? AND session_id = ? AND value_ref IS NOT NULL"
      )
      .all(query.key, query.sessionId);
    for (const stage of stages)
      nodes.destroy(JSON.parse(String(stage.value_ref)) as ValueRef);
    if (row.metadata_ref)
      nodes.destroy(JSON.parse(String(row.metadata_ref)) as ValueRef);
    for (const table of [
      "stages",
      "stage_receipts",
      "receipts",
      "migration_records"
    ])
      sql
        .get(`DELETE FROM ${table} WHERE scope_key = ? AND session_id = ?`)
        .run(query.key, query.sessionId);
    sql
      .get(
        "INSERT OR IGNORE INTO purged_sessions(scope_key, session_id) VALUES (?, ?)"
      )
      .run(query.key, query.sessionId);
    sql
      .get("DELETE FROM sessions WHERE scope_key = ? AND session_id = ?")
      .run(query.key, query.sessionId);
    database.exec("COMMIT");
    return { deleted: true };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
