import type {
  DecompositionReceipt,
  MaterialLibraryProjectManifest,
  MaterialStageId
} from "@deepwrite/contracts";

const stages: Record<MaterialStageId, string> = {
  character: "人物",
  intro: "开篇",
  pacing: "节奏与主线",
  plot_refine: "剧情细化",
  draft_excerpt: "正文片段",
  other: "设定与其他",
  gimmick: "核心梗"
};

/** Replace only the generated index for this job; all surrounding user prose survives. */
export function updateDecompositionMaterialIndex(
  manifest: MaterialLibraryProjectManifest,
  receipt: DecompositionReceipt
): string {
  const start = `<!-- deepwrite-decomposition-index:${receipt.jobId} -->`;
  const end = `<!-- /deepwrite-decomposition-index:${receipt.jobId} -->`;
  const ids = new Set<string>();
  // Entry identities are hashes. The current receipt adds one entry; prior generated links
  // retain other entries without consulting files from unrelated tasks.
  const previousStart = manifest.overview.indexOf(start);
  const previousEnd =
    previousStart < 0 ? -1 : manifest.overview.indexOf(end, previousStart);
  const previous =
    previousEnd < 0 ? "" : manifest.overview.slice(previousStart, previousEnd);
  for (const entry of manifest.entries)
    if (previous.includes(`entries/${entry.id}.md`)) ids.add(entry.id);
  receipt.refs.forEach(({ resourceId }) => ids.add(resourceId));
  const content = [
    start,
    "## 整书拆解索引",
    "",
    ...manifest.entries
      .filter(({ id }) => ids.has(id))
      .map(
        ({ title, path, stageId }) =>
          `- [${title.replaceAll("[", "（").replaceAll("]", "）")}](${path}) · ${stages[stageId]}`
      ),
    end
  ].join("\n");
  if (previousStart >= 0 && previousEnd < 0)
    throw new Error("decomposition.conflict: 素材概览中的拆解索引边界已损坏。");
  return previousStart < 0
    ? `${manifest.overview.trimEnd()}\n\n${content}\n`.trimStart()
    : manifest.overview.slice(0, previousStart) +
        content +
        manifest.overview.slice(previousEnd + end.length);
}
