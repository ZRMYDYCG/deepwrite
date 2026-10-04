import {
  CATALOG_PROJECT_MAX_CONTENT_ITEMS,
  splitDecompositionChronicles,
  type LongBookDecompositionJob,
  type DecompositionRegistry
} from "@deepwrite/contracts";
import type { FolderCatalogStore } from "../folder-catalog-store";
import { decompositionResourceId } from "./identity";

export async function assertDecompositionMaterialCapacity(
  job: LongBookDecompositionJob,
  catalog: FolderCatalogStore,
  registry?: DecompositionRegistry
) {
  if (job.target?.kind !== "material-group") return;
  const keys = {
    character: new Set<string>(),
    plot: new Set<string>(),
    draft: new Set<string>(),
    other: new Set<string>(),
    gimmick: new Set<string>()
  };
  if (registry) {
    const characters = registry.characters.filter(
      ({ tier, ignored }) => !ignored && tier !== "passerby"
    );
    let minors = 0;
    for (const entry of characters) {
      if (entry.tier === "minor_supporting")
        keys.character.add(`minor:${Math.floor(minors++ / 10)}`);
      else keys.character.add(`character:${entry.id}`);
    }
    for (const category of registry.terms
      .filter(({ ignored }) => !ignored)
      .map(({ categoryId }) => categoryId))
      keys.other.add(`world:${category}`);
    for (const { id } of splitDecompositionChronicles(
      job.chunks,
      job.models.integration
    ))
      keys.plot.add(id);
    keys.plot.add("plot:book-line");
    keys.plot.add("plot:foreshadowing");
    keys.plot.add("plot:opening");
    keys.draft.add("style:profile");
    keys.draft.add("style:excerpts");
    keys.gimmick.add("gimmick");
  }
  // Reading, registry, review and biography records stay in the task directory.
  for (const [id, unit] of Object.entries(job.units)) {
    if (unit.topic)
      keys[
        unit.topic.domain === "world"
          ? "other"
          : unit.topic.domain === "style"
            ? "draft"
            : unit.topic.domain
      ].add(id);
  }
  const snapshot = await catalog.indexSnapshot();
  for (const [kind, values] of Object.entries(keys)) {
    const library = snapshot.materials.find(
      ({ id }) =>
        job.target?.kind === "material-group" &&
        id === job.target.libraryIds[kind as keyof typeof keys]
    );
    if (!library) throw new Error("拆解素材库已移除。");
    const existing = new Set(library.entries.map(({ id }) => id));
    const newCount = [...values].filter(
      (key) =>
        !existing.has(decompositionResourceId("material-entry", job.id, key))
    ).length;
    if (existing.size + newCount > CATALOG_PROJECT_MAX_CONTENT_ITEMS)
      throw new Error(
        `素材库“${library.title}”容量不足（还需 ${newCount} 条），请建立新分组并复用通读结果。`
      );
  }
}
