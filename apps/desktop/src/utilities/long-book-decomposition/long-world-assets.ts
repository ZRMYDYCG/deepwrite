import {
  longWorldbuildingOverviewFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingItemContentPath,
  type LongBookDecompositionJob,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import { decompositionResourceId } from "./identity";
import type { NativeAssetWriter } from "./long-native-assets";

type LongWorldbuildingCategory =
  LongWorkspaceIndexSnapshot["worldbuilding"][number];

/**
 * A new book already carries the default list categories (规则、势力……). Reuse an
 * empty one with the same title instead of adding a duplicate beside it.
 */
function claimWorldCategory(
  job: LongBookDecompositionJob,
  index: LongWorkspaceIndexSnapshot,
  unitId: string,
  key: string,
  title: string
): LongWorldbuildingCategory | undefined {
  const ownedId = decompositionResourceId("world", job.id, key);
  const referenced = (id: string, own: boolean) =>
    Object.entries(job.units).some(
      ([other, unit]) =>
        (other === unitId) === own &&
        unit.outputRefs.some(({ resourceId }) => resourceId === id)
    );
  return (
    index.worldbuilding.find(({ id }) => id === ownedId) ??
    index.worldbuilding.find(({ id }) => referenced(id, true)) ??
    index.worldbuilding.find(
      (category) =>
        category.format === "list" &&
        category.title.trim() === title.trim() &&
        !category.items.length &&
        !referenced(category.id, false)
    )
  );
}
export async function applyWorldCategory(
  job: LongBookDecompositionJob,
  index: LongWorkspaceIndexSnapshot,
  unitId: string,
  key: string,
  title: string,
  content: {
    overview: string;
    items: Array<{ title: string; content: string }>;
  },
  writer: NativeAssetWriter
) {
  const now = new Date().toISOString();
  const ref = (id: string, path: string) => ({ id, path, updatedAt: now });
  let category = claimWorldCategory(job, index, unitId, key, title);
  if (!category) {
    const id = decompositionResourceId("world", job.id, key);
    category = {
      id,
      title,
      order: index.worldbuilding.length + 1,
      format: "list",
      contentAuthority: "files",
      overview: ref(
        longWorldbuildingOverviewFileId(id),
        longWorldbuildingOverviewContentPath(id)
      ),
      items: []
    };
    index.worldbuilding.push(category);
  }
  if (category.format !== "list" || !category.overview)
    throw new Error("世界观目标格式不匹配。");
  const categoryId = category.id;
  await writer.file(category.overview, content.overview);
  for (const [number, item] of content.items.entries()) {
    const id = decompositionResourceId("worlditem", job.id, `${key}:${number}`);
    let object = category.items.find((entry) => entry.id === id);
    if (!object) {
      object = {
        id,
        title: item.title,
        order: category.items.length + 1,
        file: ref(
          longWorldbuildingItemFileId(id),
          longWorldbuildingItemContentPath(categoryId, id)
        )
      };
      category.items.push(object);
    }
    await writer.file(object.file, item.content);
  }
  writer.object(categoryId, category);
}
