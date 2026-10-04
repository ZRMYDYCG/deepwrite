import { LONG_WORKSPACE_INDEX_PATH } from "@deepwrite/contracts";
import { recoverProjectTransaction } from "../project-transaction";
import { secureDirectory, secureTextFileMetadataMatches } from "./io";
import { loadProject } from "./load-project";
import type { LongProjectStoreContext } from "./store-context";
import {
  MANIFEST_PATH,
  MAX_INDEX_BYTES,
  MAX_LEDGER_RECORD_BYTES,
  MAX_MANIFEST_BYTES,
  type LoadedLongProject
} from "./types";

const MAX_CACHED_PROJECTS = 4;
const MAX_CACHE_COST = 64 * 1024 * 1024;

/** Called inside the project queue; callers must not mutate the snapshot. */
export async function loadProjectForRead(
  ctx: LongProjectStoreContext,
  rawProjectDirectory: string
): Promise<LoadedLongProject> {
  const directory = await secureDirectory(rawProjectDirectory, "长篇项目目录");
  // A journal or an active writer takes precedence even when both metadata
  // files still match (e.g. a transaction only replacing Markdown bodies).
  await recoverProjectTransaction(directory, MAX_LEDGER_RECORD_BYTES);
  const cached = ctx.projectReadCache.get(directory);
  if (cached) {
    const matches = await Promise.all([
      secureTextFileMetadataMatches(
        directory,
        MANIFEST_PATH,
        MAX_MANIFEST_BYTES,
        cached.loaded.manifestDisk
      ),
      secureTextFileMetadataMatches(
        directory,
        LONG_WORKSPACE_INDEX_PATH,
        MAX_INDEX_BYTES,
        cached.loaded.indexDisk
      )
    ]);
    if (matches.every(Boolean)) {
      ctx.projectReadCache.delete(directory);
      ctx.projectReadCache.set(directory, cached);
      return cached.loaded;
    }
  }
  const loaded = await loadProject(ctx, directory);
  // Include parsed objects, navigation metadata and descriptors in the bound,
  // as well as the raw UTF-8 buffers and UTF-16 JSON strings.
  const cost =
    (loaded.indexDisk.size + loaded.manifestDisk.size) * 12 +
    loaded.files.size * 256;
  if (cost <= MAX_CACHE_COST) {
    ctx.projectReadCache.set(directory, { loaded, cost });
    ctx.projectReadCacheCost += cost;
    while (
      ctx.projectReadCache.size > MAX_CACHED_PROJECTS ||
      ctx.projectReadCacheCost > MAX_CACHE_COST
    ) {
      const oldest = ctx.projectReadCache.entries().next().value!;
      ctx.projectReadCache.delete(oldest[0]);
      ctx.projectReadCacheCost -= oldest[1].cost;
    }
  }
  return loaded;
}
