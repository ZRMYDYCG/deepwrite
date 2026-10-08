import type { DatabaseSync } from "node:sqlite";
import { Statements } from "./schema";
import { JsonNodes } from "./json-nodes";
import { MessageRecords } from "./message-records";
import {
  fileFingerprint,
  parseLegacyFile,
  type MigrationProgress
} from "./migration-reader";
import { MigrationNormalizer } from "./migration-normalizer";
import { ConversationStorageError } from "./errors";
import {
  LEGACY_FILE_MIGRATION_ID,
  hasPendingLegacyMigration,
  prepareLegacyMigration,
  restoreCompletedLegacyMigration
} from "./legacy-migration-state";

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Must complete before the worker registers request handlers. No old-file writer is retained. */
export async function migrateLegacyFile(
  database: DatabaseSync,
  source: string,
  onProgress?: MigrationProgress
): Promise<void> {
  const sql = new Statements(database);
  if (await restoreCompletedLegacyMigration(sql)) return;
  let fingerprint: string;
  try {
    fingerprint = await fileFingerprint(source);
  } catch (error) {
    if (!missing(error)) throw error;
    if (hasPendingLegacyMigration(sql))
      throw new ConversationStorageError(
        "migration_source_missing",
        "The original history file is missing during migration; the database checkpoints have been preserved."
      );
    sql
      .get(
        "INSERT INTO migrations(source, fingerprint, state, cursor) VALUES (?, 'absent', 'complete', '{}')"
      )
      .run(LEGACY_FILE_MIGRATION_ID);
    return;
  }
  let cursor = prepareLegacyMigration(sql, fingerprint);
  const nodes = new JsonNodes(sql);
  if (cursor.phase === "parsing")
    cursor = await parseLegacyFile(
      sql,
      nodes,
      source,
      LEGACY_FILE_MIGRATION_ID,
      cursor,
      onProgress
    );
  await new MigrationNormalizer(
    sql,
    nodes,
    new MessageRecords(sql, nodes),
    LEGACY_FILE_MIGRATION_ID,
    cursor
  ).run();
  if ((await fileFingerprint(source)) !== fingerprint)
    throw new ConversationStorageError(
      "migration_changed",
      "The original history file changed during migration; both copies have been preserved."
    );
  database.exec("BEGIN IMMEDIATE");
  try {
    const { container, child } = nodes.takeField(cursor.root, "entries");
    nodes.releaseContainer(child!);
    sql
      .get(
        "UPDATE migrations SET state = 'complete', cursor = ? WHERE source = ?"
      )
      .run(JSON.stringify({ document: container }), LEGACY_FILE_MIGRATION_ID);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
