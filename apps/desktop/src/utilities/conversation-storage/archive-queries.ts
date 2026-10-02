import type {
  ConversationHistoryArchiveListQuery,
  ConversationHistoryArchiveListResult,
  ConversationHistorySession
} from "@deepwrite/contracts";
import type { Statements } from "./schema";

/** A stable global cursor keeps archived lists bounded across every conversation scope. */
export function listArchivedConversations(
  sql: Statements,
  query: ConversationHistoryArchiveListQuery,
  session: (key: string, sessionId: string) => ConversationHistorySession
): ConversationHistoryArchiveListResult {
  const limit = query.limit ?? 50;
  const after = query.after;
  const rows = sql
    .get(
      `SELECT sessions.scope_key, sessions.session_id, sessions.updated_at
       FROM sessions JOIN scopes ON scopes.key = sessions.scope_key
       WHERE sessions.deleted = 1 AND sessions.message_count > 0
         AND scopes.removed = 0
         AND (? IS NULL OR sessions.updated_at < ?
           OR (sessions.updated_at = ? AND
             (sessions.scope_key > ? OR
               (sessions.scope_key = ? AND sessions.session_id > ?))))
       ORDER BY sessions.updated_at DESC, sessions.scope_key, sessions.session_id
       LIMIT ?`
    )
    .all(
      after?.updatedAt ?? null,
      after?.updatedAt ?? null,
      after?.updatedAt ?? null,
      after?.key ?? "",
      after?.key ?? "",
      after?.sessionId ?? "",
      limit + 1
    ) as Array<{
    scope_key: string;
    session_id: string;
    updated_at: string;
  }>;
  const entries = rows.slice(0, limit).map((row) => ({
    key: row.scope_key,
    session: session(row.scope_key, row.session_id)
  }));
  const last = rows.length > limit ? rows[limit - 1] : undefined;
  return {
    entries,
    next: last
      ? {
          updatedAt: last.updated_at,
          key: last.scope_key,
          sessionId: last.session_id
        }
      : null
  };
}
