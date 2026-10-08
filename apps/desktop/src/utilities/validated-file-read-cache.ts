import { dirname, resolve } from "node:path";
import {
  assertContained,
  noFollowFileMetadataMatches,
  readNoFollowFile,
  secureDirectory,
  validateParentDirectories,
  type NoFollowFileMetadata
} from "./long-project-store/io";
import { projectTransactionFileIdentity } from "./project-transaction";

/**
 * A bounded process-local cache for validated, read-only snapshots. Callers
 * still recover transactions before reading. Every hit rechecks the filesystem;
 * returned objects are isolated from the cache and from other readers.
 */
export class ValidatedFileReadCache<T> {
  private readonly entries = new Map<
    string,
    {
      metadata: NoFollowFileMetadata;
      value: T;
      cost: number;
    }
  >();
  private bytes = 0;

  constructor(
    readonly maximumBytes: number,
    readonly parse: (text: string) => T,
    readonly maximumEntries = 4096
  ) {}

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.cost;
    this.entries.delete(key);
  }

  async read(
    root: string,
    path: string,
    maxFileBytes: number,
    label: string
  ): Promise<T> {
    return structuredClone(
      await this.validated(root, path, maxFileBytes, label)
    );
  }

  async inspect<R>(
    root: string,
    path: string,
    maxFileBytes: number,
    label: string,
    project: (value: Readonly<T>) => R
  ): Promise<R> {
    return structuredClone(
      project(await this.validated(root, path, maxFileBytes, label))
    );
  }

  private async validated(
    root: string,
    path: string,
    maxFileBytes: number,
    label: string
  ): Promise<T> {
    const directory = await secureDirectory(root, label);
    const target = resolve(directory, path);
    assertContained(directory, target);
    const key = target;
    try {
      await validateParentDirectories(directory, dirname(target));
      const entry = this.entries.get(key);
      if (
        entry &&
        (await noFollowFileMetadataMatches(
          target,
          maxFileBytes,
          entry.metadata,
          directory
        ))
      ) {
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.value;
      }
      this.remove(key);
      const { bytes, info } = await readNoFollowFile(
        target,
        maxFileBytes,
        label,
        directory
      );
      const value = this.parse(bytes.toString("utf8"));
      const cost = bytes.byteLength * 2 + 1024;
      if (cost <= this.maximumBytes) {
        this.remove(key);
        while (
          this.entries.size &&
          (this.bytes + cost > this.maximumBytes ||
            this.entries.size >= this.maximumEntries)
        ) {
          this.remove(this.entries.keys().next().value!);
        }
        this.entries.set(key, {
          value,
          cost,
          metadata: {
            identity: projectTransactionFileIdentity(info),
            size: Number(info.size),
            mtimeNs: info.mtimeNs,
            ctimeNs: info.ctimeNs
          }
        });
        this.bytes += cost;
        return value;
      }
      return value;
    } catch (error) {
      this.remove(key);
      throw error;
    }
  }
}
