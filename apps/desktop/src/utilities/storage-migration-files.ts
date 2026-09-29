import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { chmod, lstat, mkdir, open, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const STORAGE_MIGRATION_RECEIPT = ".deepwrite-storage-migration.json";
const rootRuntimeFiles = new Set([
  STORAGE_MIGRATION_RECEIPT,
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
  "lockfile",
  "long-project-registry.lock"
]);

export class StorageMigrationError extends Error {}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function optionalInfo(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

export function assertDirectory(
  info: Stats | undefined
): asserts info is Stats {
  if (!info?.isDirectory() || info.isSymbolicLink()) {
    throw new StorageMigrationError(
      "存储位置必须是真实文件夹，不能是符号链接。"
    );
  }
}

function unchanged(before: Stats, after: Stats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs
  );
}

async function hashFile(path: string, destination?: string): Promise<string> {
  const source = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  );
  let output: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const before = await source.stat();
    if (!before.isFile() || !unchanged(before, await lstat(path))) {
      throw new StorageMigrationError(
        "用户数据包含不支持的文件或正在变化，请关闭应用后重试。"
      );
    }
    if (destination)
      output = await open(destination, "wx", before.mode & 0o777);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const { bytesRead } = await source.read(buffer);
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      hash.update(chunk);
      if (output) {
        let offset = 0;
        while (offset < bytesRead) {
          const { bytesWritten } = await output.write(chunk.subarray(offset));
          if (bytesWritten === 0)
            throw new StorageMigrationError("无法完整写入目标磁盘。");
          offset += bytesWritten;
        }
      }
    }
    if (
      !unchanged(before, await source.stat()) ||
      !unchanged(before, await lstat(path))
    ) {
      throw new StorageMigrationError(
        "迁移时用户数据发生变化，请关闭应用后重试。"
      );
    }
    await output?.sync();
    return hash.digest("hex");
  } finally {
    await output?.close();
    await source.close();
  }
}

/** Hashes every regular file with bounded memory; copying never follows links. */
export async function inspectStorageTree(
  root: string,
  destination?: string
): Promise<string> {
  const tree = createHash("sha256");
  async function visit(path: string, parts: string[]): Promise<void> {
    const before = await lstat(path);
    assertDirectory(before);
    const names = (await readdir(path)).sort();
    for (const name of names) {
      if (parts.length === 0 && rootRuntimeFiles.has(name)) continue;
      if (name === "transaction.lock" && basename(path) === ".deepwrite")
        continue;
      const segments = [...parts, name];
      const sourcePath = join(path, name);
      const targetPath = destination
        ? join(destination, ...segments)
        : undefined;
      const info = await lstat(sourcePath);
      if (info.isSymbolicLink()) {
        throw new StorageMigrationError(
          "用户数据包含符号链接，迁移已取消，原目录保持不变。"
        );
      }
      if (info.isDirectory()) {
        tree.update(JSON.stringify([segments, "directory"]));
        if (targetPath) await mkdir(targetPath, { mode: 0o700 });
        await visit(sourcePath, segments);
        if (targetPath) await chmod(targetPath, info.mode & 0o777);
      } else if (info.isFile()) {
        const digest = await hashFile(sourcePath, targetPath);
        if (targetPath && digest !== (await hashFile(targetPath))) {
          throw new StorageMigrationError("目标文件校验失败，原目录保持不变。");
        }
        tree.update(JSON.stringify([segments, "file", digest]));
      } else {
        throw new StorageMigrationError(
          "用户数据包含不支持的特殊文件，迁移已取消。"
        );
      }
    }
    if (!unchanged(before, await lstat(path))) {
      throw new StorageMigrationError(
        "迁移时用户数据目录发生变化，请关闭应用后重试。"
      );
    }
    if (destination) await syncDirectory(join(destination, ...parts));
  }
  await visit(root, []);
  return tree.digest("hex");
}

export async function syncDirectory(path: string): Promise<void> {
  // Windows does not expose directory fsync through Node's file descriptors.
  if (process.platform === "win32") return;
  const directory = await open(path, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function writeDurableJson(
  path: string,
  value: unknown
): Promise<void> {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  await syncDirectory(dirname(path));
}
