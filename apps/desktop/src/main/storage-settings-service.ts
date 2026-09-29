import { constants } from "node:fs";
import { access, lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  StorageDirectoryKind,
  StorageLocation,
  StorageSettingsSnapshot
} from "@deepwrite/contracts";
import type { StorageLocationStore } from "./storage-location-store";
import type { WorkspaceDirectoryStore } from "./workspace-directory-store";
import { assertOutsideInstallationDirectory } from "./installation-directory-guard";

interface StorageSettingsOptions {
  locations: StorageLocationStore;
  workspace(): WorkspaceDirectoryStore;
  documentsPath(): string;
  installationDirectory(): string;
  chooseDirectory(currentPath: string): Promise<string | undefined>;
  confirmMigration(
    source: string,
    target: string,
    restoreDefault: boolean
  ): Promise<boolean>;
  openPath(path: string): Promise<string>;
  busy(): boolean;
  flushRenderer(): Promise<void>;
  restart(): void;
}

function contains(parent: string, child: string): boolean {
  const offset = relative(parent, child);
  return (
    offset === "" ||
    (!offset.startsWith(`..${sep}`) && offset !== ".." && !isAbsolute(offset))
  );
}

async function location(
  path: string,
  defaultPath: string
): Promise<StorageLocation> {
  const canonical = async (value: string) =>
    realpath(value).catch(() => resolve(value));
  return {
    path,
    defaultPath,
    isDefault: (await canonical(path)) === (await canonical(defaultPath))
  };
}

export class StorageSettingsService {
  private changing = false;
  private restarting = false;

  constructor(private readonly options: StorageSettingsOptions) {}

  async get(): Promise<StorageSettingsSnapshot> {
    const { locations } = this.options;
    const defaultWorkspace = join(
      this.options.documentsPath(),
      "DeepWriteBooks"
    );
    const workspace = await this.options.workspace().list();
    return {
      userData: await location(locations.currentPath, locations.defaultPath),
      workspace: await location(
        workspace.path ?? defaultWorkspace,
        defaultWorkspace
      )
    };
  }

  async openDirectory(kind: StorageDirectoryKind): Promise<{ opened: true }> {
    const snapshot = await this.get();
    const error = await this.options.openPath(
      kind === "user-data" ? snapshot.userData.path : snapshot.workspace.path
    );
    if (error)
      throw new Error("无法打开存储目录，请检查目录是否存在且可访问。");
    return { opened: true };
  }

  async resetWorkspaceDirectory() {
    this.assertIdle();
    const path = join(this.options.documentsPath(), "DeepWriteBooks");
    await mkdir(path, { recursive: true });
    return this.options.workspace().save(path);
  }

  chooseUserData() {
    return this.changeUserData(false);
  }

  resetUserData() {
    return this.changeUserData(true);
  }

  cancelRestart(): void {
    if (!this.restarting) return;
    this.options.locations.cancel();
    this.restarting = false;
  }

  get restartPending(): boolean {
    return this.restarting;
  }

  private assertIdle(): void {
    if (this.restarting || this.changing || this.options.busy()) {
      throw new Error("请等待当前任务或存储操作结束后再更改存储位置。");
    }
  }

  private async changeUserData(restoreDefault: boolean) {
    this.assertIdle();
    this.changing = true;
    try {
      const { locations } = this.options;
      const requested = restoreDefault
        ? locations.defaultPath
        : await this.options.chooseDirectory(locations.currentPath);
      if (!requested) return { restarting: false };
      if (restoreDefault) await mkdir(requested, { recursive: true });
      const info = await lstat(requested);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("请选择本机真实文件夹，不能使用符号链接。");
      const target = await realpath(requested);
      const source = await realpath(locations.currentPath);
      await assertOutsideInstallationDirectory(
        target,
        this.options.installationDirectory(),
        "用户数据目录"
      );
      if (source === target) return { restarting: false };
      if (contains(source, target) || contains(target, source))
        throw new Error("新旧用户数据目录不能互相包含，请选择独立文件夹。");
      const defaultPath = await realpath(locations.defaultPath).catch(() =>
        resolve(locations.defaultPath)
      );
      const allowExistingTarget = target === defaultPath;
      if (!allowExistingTarget && (await readdir(target)).length > 0)
        throw new Error("请选择空文件夹，已有文件不会被覆盖。");
      await access(target, constants.W_OK);
      if (
        !(await this.options.confirmMigration(
          source,
          target,
          allowExistingTarget
        ))
      )
        return { restarting: false };
      if (this.options.busy())
        throw new Error("有任务正在运行，请结束后再迁移用户数据。");
      // Failed saves must reject the IPC request before a migration is scheduled.
      await this.options.flushRenderer();
      if (this.options.busy())
        throw new Error("有任务正在运行，请结束后再迁移用户数据。");
      locations.schedule(target, allowExistingTarget);
      this.restarting = true;
      try {
        this.options.restart();
      } catch (error) {
        this.cancelRestart();
        throw error;
      }
      return { restarting: true };
    } finally {
      this.changing = false;
    }
  }
}
