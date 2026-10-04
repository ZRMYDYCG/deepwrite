import {
  decompositionAssetProse,
  type LongBookDecompositionJob,
  type DecompositionSubmissionData,
  type DecompositionReceipt,
  type MaterialStageId,
  type MaterialLibraryKind,
  type DecompositionRegistry
} from "@deepwrite/contracts";
import type { FolderCatalogStore } from "../folder-catalog-store";
import { decompositionResourceId } from "./identity";
import { latestDecompositionRef } from "./content-guard";
import type { DecompositionRecordStore } from "./record-store";

type DecompositionAssetData = Extract<
  DecompositionSubmissionData,
  { kind: "asset" }
>["asset"];
interface MaterialPlacement {
  kind: Exclude<MaterialLibraryKind, "mixed">;
  stageId: MaterialStageId;
  key: string;
  title: string;
}

/** Only finished assets become library entries; working records stay with the task. */
export function decompositionMaterialPlacement(
  job: LongBookDecompositionJob,
  unitId: string,
  data: DecompositionSubmissionData,
  registry: DecompositionRegistry
): MaterialPlacement {
  if (data.kind !== "asset") throw new Error("素材产出类型不匹配。");
  const asset = data.asset;
  if (asset.kind === "character") {
    const character = registry.characters.find(
      ({ id }) => id === asset.registryId
    );
    const index = minorCharacters(registry).findIndex(
      ({ id }) => id === asset.registryId
    );
    return {
      kind: "character",
      stageId: "character",
      key: index >= 0 ? `minor:${Math.floor(index / 10)}` : unitId,
      title:
        index >= 0
          ? `次要人物群像 ${Math.floor(index / 10) + 1}`
          : (character?.name ?? unitId)
    };
  }
  if (asset.kind === "world")
    return {
      kind: "other",
      stageId: "other",
      key: unitId,
      title:
        job.profile.worldCategories.find(({ id }) => id === asset.categoryId)
          ?.title ?? "其他世界观"
    };
  if (asset.kind === "style")
    return {
      kind: "draft",
      stageId: "draft_excerpt",
      key: unitId,
      title: "文风画像"
    };
  if (asset.kind === "opening")
    return { kind: "plot", stageId: "intro", key: unitId, title: "开篇分析" };
  if (asset.kind === "chronicle")
    return {
      kind: "plot",
      stageId: "plot_refine",
      key: unitId,
      title: `分卷剧情 ${unitId.slice(10)}`
    };
  if (asset.kind === "book-line" || asset.kind === "foreshadowing")
    return {
      kind: "plot",
      stageId: "pacing",
      key: unitId,
      title: asset.kind === "book-line" ? "全书主线" : "伏笔与回收"
    };
  if (asset.kind === "topic") {
    const kind =
      asset.domain === "world"
        ? "other"
        : asset.domain === "style"
          ? "draft"
          : asset.domain;
    return {
      kind,
      stageId:
        kind === "other"
          ? "other"
          : kind === "draft"
            ? "draft_excerpt"
            : kind === "character"
              ? "character"
              : "pacing",
      key: unitId,
      title: asset.title
    };
  }
  throw new Error("素材产出类型不匹配。");
}
function minorCharacters(registry: DecompositionRegistry) {
  return registry.characters.filter(
    ({ tier, ignored }) => tier === "minor_supporting" && !ignored
  );
}
function mainProse(asset: DecompositionAssetData): string {
  // Core gimmicks and style excerpts get entries of their own.
  if (asset.kind === "book-line") return asset.content;
  if (asset.kind === "style") return asset.content;
  return decompositionAssetProse(asset);
}

export interface DecompositionMaterialStep extends MaterialPlacement {
  libraryId: string;
  entryId: string;
  receipt: Omit<DecompositionReceipt, "refs">;
  prose: string;
}
export function decompositionMaterialSteps(
  job: LongBookDecompositionJob,
  unitId: string,
  data: DecompositionSubmissionData,
  receiptBase: Omit<DecompositionReceipt, "refs">,
  registry: DecompositionRegistry
): DecompositionMaterialStep[] {
  if (job.target?.kind !== "material-group")
    throw new Error("素材目标未绑定。");
  const libraryIds = job.target.libraryIds;
  const steps: DecompositionMaterialStep[] = [];
  const add = (placement: MaterialPlacement, prose: string) =>
    steps.push({
      ...placement,
      libraryId: libraryIds[placement.kind],
      entryId: decompositionResourceId("material-entry", job.id, placement.key),
      receipt: steps.length
        ? { ...receiptBase, id: `${receiptBase.id}_${steps.length}` }
        : receiptBase,
      prose
    });
  if (data.kind !== "asset") throw new Error("素材产出类型不匹配。");
  add(
    decompositionMaterialPlacement(job, unitId, data, registry),
    mainProse(data.asset)
  );
  if (data.asset.kind === "book-line")
    add(
      {
        kind: "gimmick",
        stageId: "gimmick",
        key: "gimmick",
        title: "核心梗、金手指与卖点"
      },
      data.asset.gimmick
    );
  if (data.asset.kind === "style" && data.asset.excerpts.length)
    add(
      {
        kind: "draft",
        stageId: "draft_excerpt",
        key: "style:excerpts",
        title: "典型片段与点评"
      },
      data.asset.excerpts
        .map(
          ({ chapterOrder, text, comment }) =>
            `## 第 ${chapterOrder} 章\n\n${text}\n\n点评：${comment}`
        )
        .join("\n\n")
    );
  return steps;
}

/** Minor characters share one entry, rebuilt from every saved member record. */
async function entryContent(
  job: LongBookDecompositionJob,
  unitId: string,
  step: DecompositionMaterialStep,
  registry: DecompositionRegistry,
  records: DecompositionRecordStore
): Promise<string> {
  if (!step.key.startsWith("minor:"))
    return `# ${step.title}\n\n${step.prose}\n`;
  const group = Number(step.key.slice(6));
  const sections: string[] = [];
  for (const member of minorCharacters(registry).slice(
    group * 10,
    group * 10 + 10
  )) {
    const id = `character:${member.id}`;
    let prose: string | undefined;
    if (id === unitId) prose = step.prose;
    else if (job.units[id]?.status === "done") {
      const { data } = await records.record(job, id);
      if (data.kind === "asset") prose = decompositionAssetProse(data.asset);
    }
    if (prose) sections.push(`## ${member.name}\n\n${prose}`);
  }
  return `# ${step.title}\n\n${sections.join("\n\n")}\n`;
}
export async function writeDecompositionMaterialUnit(
  catalog: FolderCatalogStore,
  job: LongBookDecompositionJob,
  unitId: string,
  data: DecompositionSubmissionData,
  receiptBase: Omit<DecompositionReceipt, "refs">,
  registry: DecompositionRegistry,
  records: DecompositionRecordStore
): Promise<DecompositionReceipt> {
  const refs: DecompositionReceipt["refs"] = [];
  for (const step of decompositionMaterialSteps(
    job,
    unitId,
    data,
    receiptBase,
    registry
  )) {
    const latest = latestDecompositionRef(job, step.entryId);
    const receipt = await catalog.writeManagedEntry({
      libraryId: step.libraryId,
      entryId: step.entryId,
      title: step.title,
      stageId: step.stageId,
      content: await entryContent(job, unitId, step, registry, records),
      receipt: step.receipt,
      ...(latest ? { latest } : {}),
      ...(job.units[unitId]?.regenerateApproved ? { replace: true } : {})
    });
    refs.push(...receipt.refs);
  }
  return { ...receiptBase, refs };
}
