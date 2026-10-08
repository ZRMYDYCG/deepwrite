import {
  existsSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface StorageMigrationPlan {
  sourcePath: string;
  targetPath: string;
  allowExistingTarget: boolean;
  migrationId: string;
}

interface StorageLocationState {
  version: 1;
  currentPath: string;
  pending?: StorageMigrationPlan;
}

function absolutePath(value: unknown): value is string {
  return (
    typeof value === "string" && isAbsolute(value) && !value.includes("\0")
  );
}

/** The bootstrap pointer stays outside both profiles, including when restoring the default. */
export class StorageLocationStore {
  readonly defaultPath: string;
  readonly statePath: string;
  private state: StorageLocationState;

  constructor(defaultPath: string) {
    this.defaultPath = resolve(defaultPath);
    this.statePath = join(
      dirname(this.defaultPath),
      `.${basename(this.defaultPath)}.storage-location.json`
    );
    this.state = { version: 1, currentPath: this.defaultPath };
    if (!existsSync(this.statePath)) return;
    try {
      const raw = JSON.parse(
        readFileSync(this.statePath, "utf8")
      ) as StorageLocationState;
      const plan = raw.pending;
      if (
        raw.version !== 1 ||
        !absolutePath(raw.currentPath) ||
        (plan &&
          (!absolutePath(plan.sourcePath) ||
            !absolutePath(plan.targetPath) ||
            plan.sourcePath !== raw.currentPath ||
            typeof plan.allowExistingTarget !== "boolean" ||
            typeof plan.migrationId !== "string" ||
            !/^[a-zA-Z0-9-]{1,80}$/u.test(plan.migrationId)))
      )
        throw new Error("invalid state");
      this.state = raw;
    } catch {
      throw new Error(
        "存储位置配置无法读取。请保留现有数据并检查存储位置配置文件。"
      );
    }
  }

  get currentPath(): string {
    return this.state.currentPath;
  }

  get pending(): StorageMigrationPlan | undefined {
    return this.state.pending;
  }

  schedule(targetPath: string, allowExistingTarget: boolean): void {
    this.save({
      ...this.state,
      pending: {
        sourcePath: this.currentPath,
        targetPath,
        allowExistingTarget,
        migrationId: randomUUID()
      }
    });
  }

  cancel(): void {
    this.save({ version: 1, currentPath: this.currentPath });
  }

  complete(): void {
    if (!this.pending) return;
    this.save({ version: 1, currentPath: this.pending.targetPath });
  }

  assertAvailable(): void {
    if (this.currentPath === this.defaultPath) {
      mkdirSync(this.currentPath, { recursive: true });
    }
    if (
      !existsSync(this.currentPath) ||
      !statSync(this.currentPath).isDirectory()
    ) {
      throw new Error(
        "用户数据目录不可用。请重新连接相应磁盘或恢复目录后启动，现有存储配置未更改。"
      );
    }
    // Use the same native resolution as fs/promises.realpath in Core (including
    // Windows casing). Keep the bootstrap anchor at its original location;
    // resolving the active profile must not move data or create a new pointer.
    this.state = {
      ...this.state,
      currentPath: realpathSync.native(this.currentPath)
    };
  }

  private save(state: StorageLocationState): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.${randomUUID()}.tmp`;
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(state)}\n`);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, this.statePath);
    if (process.platform !== "win32") {
      const directory = openSync(dirname(this.statePath), "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    }
    this.state = state;
  }
}
