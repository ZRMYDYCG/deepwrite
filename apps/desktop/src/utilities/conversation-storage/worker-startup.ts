import { ConversationDatabase } from "./database";
import { migrateLegacyFile } from "./legacy-file-migration";
import {
  describeStorageFailure,
  type StorageFailure,
  type StoragePhase
} from "./storage-failure";

export async function initializeConversationStorage(
  paths: { databasePath: string; legacyStatePath?: string },
  mainInstanceId: string | undefined,
  failed: (failure: StorageFailure) => void
): Promise<ConversationDatabase> {
  let phase: StoragePhase = "database-open";
  let database: ConversationDatabase | undefined;
  try {
    database = new ConversationDatabase(paths.databasePath);
    if (paths.legacyStatePath) {
      phase = "legacy-migration";
      await migrateLegacyFile(database.database, paths.legacyStatePath);
    }
    if (mainInstanceId) {
      phase = "runtime-recovery";
      database.claimMainInstance(mainInstanceId);
    }
    return database;
  } catch (error) {
    failed(describeStorageFailure(error, phase));
    try {
      database?.close();
    } catch {
      // Preserve the initialization failure if checkpointing also fails.
    }
    throw error;
  }
}
