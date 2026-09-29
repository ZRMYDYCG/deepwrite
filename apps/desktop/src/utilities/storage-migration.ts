import { mkdir, readdir, realpath, rename, rm, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  assertDirectory,
  inspectStorageTree,
  isMissing,
  optionalInfo,
  StorageMigrationError,
  syncDirectory
} from "./storage-migration-files";
import { containsPath, rebaseStoragePaths } from "./storage-migration-paths";
import {
  migrationSidecars,
  prepareMigrationJournal,
  verifyMigrationReceipt,
  writeMigrationReceipt,
  type StorageMigrationOptions
} from "./storage-migration-state";

export type { StorageMigrationOptions } from "./storage-migration-state";

async function normalizeOptions(
  input: StorageMigrationOptions
): Promise<StorageMigrationOptions> {
  if (
    !isAbsolute(input.sourcePath) ||
    !isAbsolute(input.targetPath) ||
    !input.migrationId.trim()
  ) {
    throw new StorageMigrationError("存储迁移参数无效。");
  }
  assertDirectory(await optionalInfo(input.sourcePath));
  const sourcePath = await realpath(input.sourcePath);
  const requested = resolve(input.targetPath);
  const targetInfo = await optionalInfo(requested);
  if (targetInfo) assertDirectory(targetInfo);
  const targetPath = targetInfo
    ? await realpath(requested)
    : join(await realpath(dirname(requested)), basename(requested));
  if (
    containsPath(sourcePath, targetPath) ||
    containsPath(targetPath, sourcePath)
  ) {
    throw new StorageMigrationError("用户数据目录不能相同，也不能互相包含。");
  }
  return { ...input, sourcePath, targetPath };
}

async function assertAvailableTarget(
  options: StorageMigrationOptions
): Promise<void> {
  const target = await optionalInfo(options.targetPath);
  if (!target) return;
  assertDirectory(target);
  if (
    !options.allowExistingTarget &&
    (await readdir(options.targetPath)).length > 0
  ) {
    throw new StorageMigrationError("目标文件夹不是空目录，请选择其他位置。");
  }
}

async function cleanJournal(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

/** Dedicated offline Core writer. Both Electron profiles must be closed. */
export async function migrateStorageProfile(
  input: StorageMigrationOptions
): Promise<void> {
  const options = await normalizeOptions(input);
  const { sourcePath, targetPath } = options;
  const paths = migrationSidecars(options);
  if (await verifyMigrationReceipt(targetPath, options)) {
    await cleanJournal(paths.journal);
    return;
  }
  const backup = await optionalInfo(paths.backup);
  if (!backup) await assertAvailableTarget(options);
  await prepareMigrationJournal(options);
  if (backup) {
    assertDirectory(backup);
    if (await optionalInfo(targetPath))
      throw new StorageMigrationError(
        "迁移目标与备份同时存在，请保留数据后重新选择位置。"
      );
    // A crash between the two renames is recoverable from deterministic sidecars.
    let ready: boolean;
    try {
      ready = await verifyMigrationReceipt(paths.staging, options);
    } catch {
      await rename(paths.backup, targetPath);
      throw new StorageMigrationError("迁移恢复校验失败，原目标目录已恢复。");
    }
    if (ready) {
      await rename(paths.staging, targetPath);
      await syncDirectory(dirname(targetPath));
      await cleanJournal(paths.journal);
      return;
    }
    await rename(paths.backup, targetPath);
    throw new StorageMigrationError(
      "迁移尚未完成，原目标目录已恢复，请重新选择位置。"
    );
  }
  if (!(await verifyMigrationReceipt(paths.staging, options))) {
    const staging = await optionalInfo(paths.staging);
    if (staging) {
      assertDirectory(staging);
      await rm(paths.staging, { recursive: true });
    }
    await mkdir(paths.staging, { mode: 0o700 });
    const sourceDigest = await inspectStorageTree(sourcePath, paths.staging);
    if (sourceDigest !== (await inspectStorageTree(paths.staging))) {
      throw new StorageMigrationError("复制校验失败，原目录保持不变。");
    }
    await rebaseStoragePaths(paths.staging, sourcePath, targetPath);
    await writeMigrationReceipt(paths.staging, options, sourceDigest);
  }
  await assertAvailableTarget(options);
  let targetBackedUp = false;
  try {
    if (await optionalInfo(targetPath)) {
      await rename(targetPath, paths.backup);
      targetBackedUp = true;
      await syncDirectory(dirname(targetPath));
    }
    await rename(paths.staging, targetPath);
    await syncDirectory(dirname(targetPath));
  } catch (error) {
    if (targetBackedUp && !(await optionalInfo(targetPath))) {
      await rename(paths.backup, targetPath);
      await syncDirectory(dirname(targetPath));
    }
    throw error;
  }
  await cleanJournal(paths.journal);
}
