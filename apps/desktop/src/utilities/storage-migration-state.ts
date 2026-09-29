import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertDirectory,
  inspectStorageTree,
  isMissing,
  optionalInfo,
  STORAGE_MIGRATION_RECEIPT,
  StorageMigrationError,
  writeDurableJson
} from "./storage-migration-files";

export interface StorageMigrationOptions {
  sourcePath: string;
  targetPath: string;
  allowExistingTarget: boolean;
  migrationId: string;
}

interface MigrationReceipt extends StorageMigrationOptions {
  version: 1;
  sourceDigest: string;
  targetDigest: string;
}

export function migrationSidecars(options: StorageMigrationOptions) {
  const key = createHash("sha256")
    .update(options.migrationId)
    .digest("hex")
    .slice(0, 24);
  const prefix = join(dirname(options.targetPath), `.deepwrite-storage-${key}`);
  return {
    journal: `${prefix}.json`,
    staging: `${prefix}.staging`,
    backup: `${prefix}.backup`
  };
}

function sameMigration(
  value: unknown,
  expected: StorageMigrationOptions
): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(expected).every(
    ([key, item]) => Reflect.get(value, key) === item
  );
}

async function readOptionalJson(path: string): Promise<unknown> {
  const info = await optionalInfo(path);
  if (!info) return undefined;
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024) {
    throw new StorageMigrationError("迁移恢复记录无效，原数据已保留。");
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw new StorageMigrationError("迁移恢复记录损坏，原数据已保留。");
  }
}

export async function prepareMigrationJournal(
  options: StorageMigrationOptions
): Promise<void> {
  const { journal } = migrationSidecars(options);
  const existing = await readOptionalJson(journal);
  if (existing !== undefined) {
    if (!sameMigration(existing, options))
      throw new StorageMigrationError("迁移恢复记录与目标不匹配。");
    return;
  }
  const { staging, backup } = migrationSidecars(options);
  if ((await optionalInfo(staging)) || (await optionalInfo(backup))) {
    throw new StorageMigrationError(
      "发现没有恢复记录的迁移文件，已保留，请重新选择位置。"
    );
  }
  await writeDurableJson(journal, { version: 1, ...options });
}

export async function writeMigrationReceipt(
  staging: string,
  options: StorageMigrationOptions,
  sourceDigest: string
): Promise<void> {
  const targetDigest = await inspectStorageTree(staging);
  const receipt: MigrationReceipt = {
    version: 1,
    ...options,
    sourceDigest,
    targetDigest
  };
  await writeDurableJson(join(staging, STORAGE_MIGRATION_RECEIPT), receipt);
}

export async function verifyMigrationReceipt(
  root: string,
  options: StorageMigrationOptions
): Promise<boolean> {
  const info = await optionalInfo(root);
  if (!info) return false;
  assertDirectory(info);
  const value = await readOptionalJson(join(root, STORAGE_MIGRATION_RECEIPT));
  if (!sameMigration(value, options)) return false;
  const receipt = value as MigrationReceipt;
  if (
    receipt.version !== 1 ||
    typeof receipt.targetDigest !== "string" ||
    typeof receipt.sourceDigest !== "string" ||
    receipt.targetDigest !== (await inspectStorageTree(root)) ||
    receipt.sourceDigest !== (await inspectStorageTree(options.sourcePath))
  ) {
    throw new StorageMigrationError("迁移恢复校验失败，原数据与备份已保留。");
  }
  return true;
}
