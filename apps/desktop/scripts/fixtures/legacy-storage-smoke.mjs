import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";

export async function seedLegacyStorageSmoke(profile) {
  await mkdir(join(profile, "renderer-state"), { recursive: true });
  await writeFile(
    join(profile, "renderer-state", "conversation-persistence.json"),
    JSON.stringify({
      version: 1,
      entries: {
        "conversation-history:storage-smoke-legacy": {
          version: 1,
          activeSessionId: "storage_legacy_session",
          conversations: [
            {
              sessionId: "storage_legacy_session",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              draft: "legacy draft",
              messages: [
                {
                  id: "storage_legacy_message",
                  role: "user",
                  content: "legacy storage history",
                  createdAt: "2026-01-01T00:00:00.000Z",
                  status: "completed"
                }
              ]
            }
          ]
        },
        "conversation-preferences:storage-smoke-legacy": { layout: "legacy" }
      }
    })
  );
}

/** Simulate the completed absolute-path marker left by the released 1.6.303. */
export function useLegacyStorageSmokePath(profile) {
  const database = new DatabaseSync(
    join(profile, "renderer-state", "conversations.sqlite")
  );
  try {
    const rows = database
      .prepare("SELECT source FROM migrations WHERE state = 'complete'")
      .all();
    assert.equal(rows.length, 1);
    const source = join(
      profile,
      "renderer-state",
      "conversation-persistence.json"
    );
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare("UPDATE migrations SET source = ? WHERE source = ?")
        .run(source, rows[0].source);
      database
        .prepare("UPDATE migration_records SET source = ? WHERE source = ?")
        .run(source, rows[0].source);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}
