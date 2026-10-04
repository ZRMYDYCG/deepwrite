import { nowIso } from "@deepwrite/shared";
import type {
  CachedPagedTextFile,
  LoadedLongProject,
  LongProjectStoreOptions
} from "./types";

export interface LongProjectStoreContext {
  readonly now: () => string;
  readonly queues: Map<string, Promise<void>>;
  readonly documentReadCache: Map<string, CachedPagedTextFile>;
  documentReadCacheCost: number;
  readonly projectReadCache: Map<
    string,
    { loaded: LoadedLongProject; cost: number }
  >;
  projectReadCacheCost: number;
  timestamp(): string;
  runExclusive<T>(key: string, task: () => Promise<T>): Promise<T>;
}

export function createLongProjectStoreContext(
  options: LongProjectStoreOptions = {}
): LongProjectStoreContext {
  const now = options.now ?? nowIso;
  const queues = new Map<string, Promise<void>>();
  const documentReadCache = new Map<string, CachedPagedTextFile>();
  const ctx: LongProjectStoreContext = {
    now,
    queues,
    documentReadCache,
    documentReadCacheCost: 0,
    projectReadCache: new Map(),
    projectReadCacheCost: 0,
    timestamp(): string {
      const value = now();
      if (!Number.isFinite(Date.parse(value))) {
        throw new Error("长篇项目时间提供器返回了无效时间。");
      }
      return value;
    },
    async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
      const previous = queues.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolveGate) => {
        release = resolveGate;
      });
      const tail = previous.catch(() => undefined).then(() => gate);
      queues.set(key, tail);
      await previous.catch(() => undefined);
      try {
        return await task();
      } finally {
        release();
        if (queues.get(key) === tail) {
          queues.delete(key);
        }
      }
    }
  };
  return ctx;
}
