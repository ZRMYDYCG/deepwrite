import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeSyncJson } from "./atomic-json";
import { safeStorage } from "electron";
import {
  DeviceSyncSecretSchema,
  openSyncMetadata,
  sealSyncMetadata,
  syncMetadataSchema,
  type SyncSecretSealer,
  type SyncCredentialStore,
  type SyncMetadata,
  type SyncMetadataStore
} from "@deepwrite/contracts";

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return null;
    throw error;
  }
}
function requireSecureStorage(): void {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text")
  )
    throw new Error("系统安全存储不可用。");
}

/** API keys inside sync state are encrypted with the OS secure storage at rest. */
const secretSealer: SyncSecretSealer = {
  async seal(content) {
    requireSecureStorage();
    return safeStorage.encryptString(content).toString("base64");
  },
  async open(sealed) {
    try {
      requireSecureStorage();
      return safeStorage.decryptString(Buffer.from(sealed, "base64"));
    } catch {
      return null;
    }
  }
};

export class DesktopSyncMetadataStore implements SyncMetadataStore {
  private readonly path: string;
  constructor(root: string) {
    this.path = join(root, "device-sync.json");
  }
  async read(): Promise<SyncMetadata | null> {
    const value = await readOptional(this.path);
    return value === null
      ? null
      : openSyncMetadata(
          syncMetadataSchema.parse(JSON.parse(value)),
          secretSealer
        );
  }
  /** A copy with every API key sealed, for writers that put sync state in files themselves. */
  seal(value: SyncMetadata): Promise<SyncMetadata> {
    return sealSyncMetadata(syncMetadataSchema.parse(value), secretSealer);
  }
  async write(value: SyncMetadata): Promise<void> {
    const sealed = await this.seal(value);
    await writeSyncJson(this.path, JSON.stringify(sealed));
  }
}
export class DesktopSyncCredentialStore implements SyncCredentialStore {
  private readonly path: string;
  constructor(root: string) {
    this.path = join(root, "device-sync-secret.json");
  }
  private check(): void {
    requireSecureStorage();
  }
  async get(): Promise<string | null> {
    const value = await readOptional(this.path);
    if (value === null) return null;
    this.check();
    return safeStorage.decryptString(
      Buffer.from(
        DeviceSyncSecretSchema.parse(JSON.parse(value)).encrypted,
        "base64"
      )
    );
  }
  async set(value: string): Promise<void> {
    this.check();
    await writeSyncJson(
      this.path,
      JSON.stringify({
        schemaVersion: 1,
        encrypted: safeStorage.encryptString(value).toString("base64")
      })
    );
  }
  async delete(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
