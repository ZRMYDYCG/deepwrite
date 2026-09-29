import { StorageMigrationError } from "./storage-migration-files";
import { migrateStorageProfile } from "./storage-migration";

const [sourcePath, targetPath, allowExisting, migrationId] =
  process.argv.slice(2);
try {
  if (
    !sourcePath ||
    !targetPath ||
    !migrationId ||
    !["true", "false"].includes(allowExisting ?? "")
  ) {
    throw new StorageMigrationError("存储迁移参数无效。");
  }
  await migrateStorageProfile({
    sourcePath,
    targetPath,
    allowExistingTarget: allowExisting === "true",
    migrationId
  });
} catch (error) {
  // Native errors may contain filenames or sensitive JSON; expose only controlled messages.
  process.stderr.write(
    `${error instanceof StorageMigrationError ? error.message : "存储迁移失败，请检查磁盘空间与目录权限。原数据已保留。"}\n`
  );
  process.exitCode = 1;
}
