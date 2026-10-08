import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  mkdir,
  open,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, join, basename, isAbsolute } from "node:path";
import { inspectStorageTree, optionalInfo } from "../storage-migration-files";
import { ConversationDatabase } from "./database";
import { ConversationStorageError } from "./errors";
import { migrateLegacyFile } from "./legacy-file-migration";
import { LEGACY_FILE_MIGRATION_ID } from "./legacy-migration-state";
import { describeStorageFailure, type StoragePhase } from "./storage-failure";

export interface OfflineRepairResult {
  status: "repaired" | "reset" | "failed";
  backupPath?: string;
  backupVerified: boolean;
  code?: string;
  phase?: StoragePhase;
  nativeCode?: string;
  sqliteCode?: number;
  sessions?: number;
  messages?: number;
}

function checkDatabase(path: string): void {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    if (
      database
        .prepare("PRAGMA quick_check")
        .all()
        .some((row) => row.quick_check !== "ok")
    )
      throw new ConversationStorageError(
        "database_corrupt",
        "Conversation database integrity check failed."
      );
  } finally {
    database.close();
  }
}

async function assertWritable(directory: string): Promise<void> {
  const path = join(directory, `.repair-write-probe-${randomUUID()}`);
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile("DeepWrite storage write probe\n");
    await handle.sync();
  } finally {
    await handle.close();
    await rm(path, { force: true });
  }
}

/** Offline Core repair. The Windows launcher requires every app process to exit. */
export async function repairConversationStorage(
  userDataPath: string,
  resetConversations = false
): Promise<OfflineRepairResult> {
  let phase: StoragePhase = "database-open";
  let backupPath: string | undefined;
  let backupVerified = false;
  let database: ConversationDatabase | undefined;
  let originalPath: string | undefined;
  let statePath: string | undefined;
  try {
    if (!isAbsolute(userDataPath))
      throw new ConversationStorageError(
        "location_unavailable",
        "Use an absolute user data folder path."
      );
    const profile = await realpath(userDataPath);
    statePath = join(profile, "renderer-state");
    if (!(await stat(statePath)).isDirectory())
      throw new ConversationStorageError(
        "location_unavailable",
        "The renderer-state folder is unavailable."
      );
    const databasePath = join(statePath, "conversations.sqlite");
    const legacyPath = join(statePath, "conversation-persistence.json");
    if (
      !(await optionalInfo(databasePath)) &&
      !(await optionalInfo(legacyPath))
    )
      throw new ConversationStorageError(
        "storage_files_missing",
        "No known conversation storage files were found."
      );

    const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
    backupPath = join(
      dirname(profile),
      `${basename(profile)}-conversation-backup-${stamp}-${randomUUID().slice(0, 8)}`
    );
    await mkdir(backupPath, { mode: 0o700 });
    const backupState = join(backupPath, "renderer-state");
    await mkdir(backupState, { mode: 0o700 });
    const fingerprint = await inspectStorageTree(statePath, backupState);
    if (fingerprint !== (await inspectStorageTree(backupState)))
      throw new ConversationStorageError(
        "backup_failed",
        "Conversation backup verification failed."
      );
    await writeFile(
      join(backupPath, "backup.json"),
      JSON.stringify({
        version: 1,
        userDataPath: profile,
        fingerprint,
        resetConversations
      }),
      { mode: 0o600 }
    );
    backupVerified = true;

    if (resetConversations) {
      // Only this explicit mode isolates history. Settings, keys and books live
      // outside renderer-state and are never modified by the repair helper.
      originalPath = join(backupPath, "original-renderer-state");
      await rename(statePath, originalPath);
      await mkdir(statePath, { mode: 0o700 });
    } else if (await optionalInfo(databasePath)) {
      checkDatabase(join(backupState, "conversations.sqlite"));
    }
    await assertWritable(statePath);
    database = new ConversationDatabase(databasePath);
    phase = "legacy-migration";
    await migrateLegacyFile(database.database, legacyPath);
    // Older installed builds still query the absolute path. The original
    // checkpoints are already preserved in the verified offline backup.
    for (const source of new Set([
      legacyPath,
      join(userDataPath, "renderer-state", "conversation-persistence.json")
    ]))
      database.database
        .prepare(
          "INSERT INTO migrations(source, fingerprint, state, cursor, checked_records) SELECT ?, fingerprint, state, cursor, checked_records FROM migrations WHERE source = ? AND state = 'complete' ON CONFLICT(source) DO UPDATE SET fingerprint = excluded.fingerprint, state = excluded.state, cursor = excluded.cursor, checked_records = excluded.checked_records"
        )
        .run(source, LEGACY_FILE_MIGRATION_ID);
    phase = "runtime-recovery";
    database.claimMainInstance(`offline-repair-${randomUUID()}`);
    const sessions = Number(
      database.database.prepare("SELECT COUNT(*) AS count FROM sessions").get()
        ?.count ?? 0
    );
    const messages = Number(
      database.database.prepare("SELECT COUNT(*) AS count FROM messages").get()
        ?.count ?? 0
    );
    database.close();
    database = undefined;
    return {
      status: resetConversations ? "reset" : "repaired",
      backupPath,
      backupVerified,
      sessions,
      messages
    };
  } catch (error) {
    try {
      database?.close();
    } catch {
      /* Keep the original failure. */
    }
    if (originalPath && statePath) {
      try {
        if (await optionalInfo(statePath))
          await rename(statePath, join(backupPath!, "failed-reset"));
        await rename(originalPath, statePath);
      } catch {
        // Both original and failed reset folders are retained for manual restore.
      }
    }
    const { message: _message, ...failure } = describeStorageFailure(
      error,
      phase
    );
    return {
      status: "failed",
      backupVerified,
      ...(backupPath ? { backupPath } : {}),
      ...failure
    };
  }
}
