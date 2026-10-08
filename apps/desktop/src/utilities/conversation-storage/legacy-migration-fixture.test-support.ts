import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConversationDatabase } from "./database";
import { JsonNodes } from "./json-nodes";
import { LEGACY_FILE_MIGRATION_ID } from "./legacy-migration-state";
import { MessageRecords } from "./message-records";
import { MigrationNormalizer } from "./migration-normalizer";
import { parseLegacyFile, type ParsingCursor } from "./migration-reader";
import { Statements } from "./schema";

export const legacyFixtureKey = "conversation-history:relocation-fixture";
export const legacyFixturePreferenceKey =
  "conversation-preferences:relocation-fixture";
export const legacyFixtureDate = "2026-10-05T00:00:00.000Z";

export function legacyProfilePaths(profile: string) {
  return {
    profile,
    path: join(profile, "renderer-state", "conversations.sqlite"),
    source: join(profile, "renderer-state", "conversation-persistence.json")
  };
}

export async function seedLegacyProfile(profile: string, content = "原始正文") {
  const paths = legacyProfilePaths(profile);
  await mkdir(join(profile, "renderer-state"), { recursive: true });
  const record = (sessionId: string, ids: string[]) => ({
    sessionId,
    createdAt: legacyFixtureDate,
    updatedAt: legacyFixtureDate,
    draft: "旧草稿",
    messages: ids.map((id) => ({
      id,
      role: "user",
      content,
      createdAt: legacyFixtureDate,
      status: "completed"
    }))
  });
  const original = JSON.stringify({
    version: 1,
    entries: {
      [legacyFixtureKey]: {
        version: 1,
        activeSessionId: "session",
        conversations: [
          record("session", ["first", "second"]),
          record("removed-session", ["removed-message"])
        ]
      },
      [legacyFixturePreferenceKey]: { layout: "old" }
    }
  });
  await writeFile(paths.source, original);
  return { ...paths, original };
}

/** Reproduce the absolute-path checkpoints persisted by 1.6.303. */
export function useOldMigrationPath(
  database: ConversationDatabase,
  source: string
): void {
  database.database.exec("BEGIN IMMEDIATE");
  try {
    database.database
      .prepare("UPDATE migrations SET source = ? WHERE source = ?")
      .run(source, LEGACY_FILE_MIGRATION_ID);
    database.database
      .prepare("UPDATE migration_records SET source = ? WHERE source = ?")
      .run(source, LEGACY_FILE_MIGRATION_ID);
    database.database.exec("COMMIT");
  } catch (error) {
    database.database.exec("ROLLBACK");
    throw error;
  }
}

/** Run the old replay against real parsed nodes, including its durable failure checkpoint. */
export async function replayLegacyUnderNewPath(
  database: ConversationDatabase,
  source: string
): Promise<void> {
  const cursor: ParsingCursor = {
    phase: "parsing",
    offset: 0,
    parser: { frames: [] }
  };
  database.database
    .prepare(
      "INSERT INTO migrations(source, fingerprint, state, cursor) VALUES (?, ?, 'parsing', ?)"
    )
    .run(
      source,
      createHash("sha256")
        .update(await readFile(source))
        .digest("hex"),
      JSON.stringify(cursor)
    );
  const sql = new Statements(database.database);
  const nodes = new JsonNodes(sql);
  const parsed = await parseLegacyFile(sql, nodes, source, source, cursor);
  await new MigrationNormalizer(
    sql,
    nodes,
    new MessageRecords(sql, nodes),
    source,
    parsed
  ).run();
}
