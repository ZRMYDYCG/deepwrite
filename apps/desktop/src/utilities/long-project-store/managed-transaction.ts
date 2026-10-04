import {
  LONG_WORKSPACE_INDEX_PATH,
  LongWorkspaceIndexSnapshotSchema,
  LongProjectManifestSchema
} from "@deepwrite/contracts";
import {
  commitProjectTransaction,
  type ProjectTransactionFileOperation
} from "../project-transaction";
import { loadProject } from "./load-project";
import { secureDirectory, serializeJson } from "./io";
import type { LongProjectStoreContext } from "./store-context";
import type { LoadedLongProject } from "./types";

/** Core-owned writes share the normal project queue, retaining object CAS. */
export async function transactManagedLongProject<T>(
  ctx: LongProjectStoreContext,
  path: string,
  mutate: (
    loaded: LoadedLongProject
  ) => Promise<{ operations: ProjectTransactionFileOperation[]; result: T }>
): Promise<T> {
  const root = await secureDirectory(path, "长篇项目");
  return ctx.runExclusive(root, async () => {
    const loaded = await loadProject(ctx, root);
    const { operations, result } = await mutate(loaded);
    if (!operations.length) return result;
    const now = ctx.timestamp();
    const index = LongWorkspaceIndexSnapshotSchema.parse({
      ...loaded.index,
      updatedAt: now
    });
    const manifest = LongProjectManifestSchema.parse({
      ...loaded.manifest,
      updatedAt: now,
      workspaceIndexFile: {
        ...loaded.manifest.workspaceIndexFile,
        updatedAt: now
      }
    });
    await commitProjectTransaction({
      projectRoot: root,
      maxFileBytes: 128 * 1024 * 1024,
      operations: [
        ...operations,
        {
          path: LONG_WORKSPACE_INDEX_PATH,
          content: serializeJson(index),
          expectedSha256: loaded.indexDisk.sha256
        },
        {
          path: "deepwrite.json",
          content: serializeJson(manifest),
          expectedSha256: loaded.manifestDisk.sha256
        }
      ]
    });
    ctx.documentReadCache.clear();
    ctx.documentReadCacheCost = 0;
    return result;
  });
}
