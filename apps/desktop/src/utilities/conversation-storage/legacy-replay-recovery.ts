import { JsonNodes, type ValueRef } from "./json-nodes";
import type { MigrationRow } from "./legacy-migration-state";
import type { NormalizingCursor } from "./migration-reader";
import { migrationRecordFingerprint } from "./migration-record-fingerprint";
import type { Statements } from "./schema";

function archive(sql: Statements, key: string, ref: string): void {
  // Transfer the replay's references rather than destroying content. The raw
  // file, checkpoints and checksums also remain available for recovery.
  sql
    .get("INSERT INTO legacy_backups(key, value_ref) VALUES (?, ?)")
    .run(`migration-replay:${key}`, ref);
}

async function removeReplayedMessages(
  sql: Statements,
  nodes: JsonNodes,
  source: string
): Promise<void> {
  const messages = sql
    .get(
      "SELECT m.scope_key, m.session_id, m.message_id, m.value_ref, r.checksum FROM migration_records r JOIN messages m USING(scope_key, session_id, message_id) WHERE r.source = ?"
    )
    .iterate(source);
  for (const message of messages) {
    const key = String(message.scope_key);
    const sessionId = String(message.session_id);
    const messageId = String(message.message_id);
    const ref = String(message.value_ref);
    if (
      (await migrationRecordFingerprint(nodes, JSON.parse(ref) as ValueRef)) !==
      message.checksum
    )
      continue; // A subsequent edit is authoritative, even if recovery was deferred.
    archive(sql, `${key}:${sessionId}:${messageId}`, ref);
    sql
      .get(
        "DELETE FROM messages WHERE scope_key = ? AND session_id = ? AND message_id = ?"
      )
      .run(key, sessionId, messageId);
  }
}

function removeReplayedValues(
  sql: Statements,
  nodes: JsonNodes,
  cursor: NormalizingCursor
): void {
  const entriesRef = nodes.get(cursor.root, ["entries"]);
  if (!entriesRef || !("node" in entriesRef)) return;
  const entries = nodes.node(entriesRef.node);
  if (entries.kind !== "object") return;
  for (const [key, ref] of entries.entries.slice(0, cursor.entry)) {
    const serialized = JSON.stringify(ref);
    const row = sql
      .get("SELECT value_ref FROM legacy_values WHERE key = ?")
      .get(key);
    if (row?.value_ref !== serialized) continue;
    archive(sql, key, serialized);
    sql.get("DELETE FROM legacy_values WHERE key = ?").run(key);
  }
}

function removeResurrectedPurgedSessions(sql: Statements): void {
  const sessions = sql
    .get(
      "SELECT s.scope_key, s.session_id, s.metadata_ref FROM sessions s JOIN purged_sessions p USING(scope_key, session_id) WHERE s.revision = 0 AND s.generation = 0 AND s.sequence = 0 AND s.message_count = 0"
    )
    .iterate();
  for (const session of sessions) {
    const key = String(session.scope_key);
    const sessionId = String(session.session_id);
    if (session.metadata_ref)
      archive(
        sql,
        `${key}:${sessionId}:metadata`,
        String(session.metadata_ref)
      );
    sql
      .get(
        "UPDATE scopes SET active_session_id = NULL WHERE key = ? AND active_session_id = ?"
      )
      .run(key, sessionId);
    sql
      .get("DELETE FROM sessions WHERE scope_key = ? AND session_id = ?")
      .run(key, sessionId);
  }
}

/** Run inside the transaction that adopts the completed import. */
export async function recoverFailedLegacyReplays(
  sql: Statements,
  completed: MigrationRow
): Promise<void> {
  const { document } = JSON.parse(completed.cursor) as {
    document?: ValueRef;
  };
  if (!document || !("node" in document)) return;
  const rows = sql
    .get(
      "SELECT source, cursor FROM migrations WHERE state = 'normalizing' AND fingerprint = ?"
    )
    .all(completed.fingerprint);
  const nodes = new JsonNodes(sql);
  let recovered = false;
  for (const row of rows) {
    const cursor = JSON.parse(String(row.cursor)) as NormalizingCursor;
    // A genuinely resumed import retains the same root. It must never lose
    // records written under its original checkpoint's path.
    if (!("node" in cursor.root) || cursor.root.node === document.node)
      continue;
    await removeReplayedMessages(sql, nodes, String(row.source));
    removeReplayedValues(sql, nodes, cursor);
    sql
      .get("UPDATE migrations SET state = 'superseded' WHERE source = ?")
      .run(String(row.source));
    recovered = true;
  }
  if (recovered) removeResurrectedPurgedSessions(sql);
}
