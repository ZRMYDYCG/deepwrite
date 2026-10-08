import {
  DecompositionAssetPartSchema,
  DecompositionAssetSchema,
  normalizeDecompositionRegistry,
  type DecompositionAssetPart,
  type DecompositionReadingCard,
  type DecompositionReceipt,
  type DecompositionSubmissionData,
  type LongBookDecompositionJob
} from "@deepwrite/contracts";
import { readDecompositionCards } from "./query-records";
import { registryMentionItems, registryPartItems } from "./registry-mentions";
import { registryMergeInput } from "./registry-merge";
import { expandRegistryPlan } from "./registry-plan";
import { decompositionRecordId } from "./record-store";
import type { DecompositionService } from "./service";
import { validateDecompositionRegistryCoverage } from "./workflow";

type Part = DecompositionAssetPart;
const STAGED_KINDS = new Set<string>(
  DecompositionAssetPartSchema.options.map((option) => option.shape.kind.value)
);

/** Later batches replace an earlier entry with the same key, in place. */
function mergeList<T>(prior: T[], next: T[], key: (item: T) => string): T[] {
  const merged = new Map(prior.map((item) => [key(item), item]));
  for (const item of next) merged.set(key(item), item);
  return [...merged.values()];
}
function mergeParts(prior: Part | undefined, next: Part): Part {
  if (!prior || prior.kind !== next.kind) return next;
  if (next.kind === "world" && prior.kind === "world") {
    const overview = next.overview ?? prior.overview;
    return {
      kind: "world",
      categoryId: next.categoryId,
      ...(overview ? { overview } : {}),
      items: mergeList(prior.items, next.items, ({ title }) => title)
    };
  }
  if (next.kind === "book-line" && prior.kind === "book-line") {
    const content = next.content ?? prior.content;
    const gimmick = next.gimmick ?? prior.gimmick;
    return {
      kind: "book-line",
      ...(content ? { content } : {}),
      ...(gimmick ? { gimmick } : {}),
      volumes: mergeList(prior.volumes, next.volumes, ({ title }) => title)
    };
  }
  if (next.kind === "foreshadowing" && prior.kind === "foreshadowing")
    return {
      kind: "foreshadowing",
      lines: mergeList(prior.lines, next.lines, ({ key }) => key)
    };
  if (next.kind === "chronicle" && prior.kind === "chronicle")
    return {
      kind: "chronicle",
      ...((next.summary ?? prior.summary)
        ? { summary: next.summary ?? prior.summary }
        : {}),
      points: mergeList(
        prior.points,
        next.points,
        ({ title, startOrder, endOrder }) =>
          `${startOrder}-${endOrder}-${title}`
      )
    };
  return next;
}
export const stagedEntries = (part: Part) =>
  part.kind === "world"
    ? part.items.length
    : part.kind === "foreshadowing"
      ? part.lines.length
      : part.kind === "book-line"
        ? part.volumes.length
        : part.points.length;

/**
 * Puts a submission in the form the checks expect: a registry plan becomes
 * the registry it decides, and the final batch of a staged asset carries
 * every batch staged before it.
 */
export async function resolveDecompositionSubmission(
  service: DecompositionService,
  job: LongBookDecompositionJob,
  unitId: string,
  data: DecompositionSubmissionData,
  cards: () => Promise<DecompositionReadingCard[]>
): Promise<DecompositionSubmissionData> {
  if (data.kind === "registry-plan") {
    if (unitId === "registry:merge") {
      const merge = await registryMergeInput(
        job,
        (id) => service.reader.record(job, id),
        await cards()
      );
      return {
        kind: "registry",
        registry: expandRegistryPlan(merge.items, data.plan, merge.owners)
          .registry
      };
    }
    if (!unitId.startsWith("registry:part:"))
      throw new Error("名册计划只能提交到名册单元。");
    const items = registryPartItems(
      job,
      registryMentionItems(await cards()),
      unitId
    );
    return {
      kind: "registry",
      registry: expandRegistryPlan(items, data.plan).registry
    };
  }
  if (data.kind !== "asset" || !STAGED_KINDS.has(data.asset.kind)) return data;
  const draft = await service.records.draft(job, unitId);
  if (!draft) return data;
  const merged = mergeParts(draft, data.asset as Part);
  const checked = DecompositionAssetSchema.safeParse({
    ...data.asset,
    ...merged
  });
  if (!checked.success)
    throw new Error(
      `合并已暂存的 ${stagedEntries(draft)} 条后成品超出上限，请精简或合并条目后重交：${checked.error.issues[0]?.message ?? "格式无效"}`
    );
  return { kind: "asset", asset: checked.data };
}

/** Stages one batch; the unit stays unfinished until its final submission. */
export async function stageDecompositionPart(
  service: DecompositionService,
  job: LongBookDecompositionJob,
  unitId: string,
  part: Part
): Promise<DecompositionReceipt> {
  const merged = mergeParts(await service.records.draft(job, unitId), part);
  const checked = DecompositionAssetPartSchema.safeParse(merged);
  if (!checked.success || JSON.stringify(merged).length > 200_000)
    throw new Error(
      "暂存的条目已达到单个成品上限（200,000 字或条目数上限），请精简后用最后一批完成提交。"
    );
  await service.records.saveDraft(job, unitId, checked.data);
  return {
    id: `${decompositionRecordId(job, unitId)}_draft`,
    jobId: job.id,
    outputVersion: job.outputVersion,
    unitId,
    inputRevision: job.units[unitId]!.inputRevision,
    refs: [],
    savedAt: new Date().toISOString(),
    staged: stagedEntries(checked.data)
  };
}

/** Bookkeeping shared by every unit Core finishes. */
export function markDecompositionUnitDone(
  job: LongBookDecompositionJob,
  unitId: string,
  receipt: DecompositionReceipt
) {
  const unit = job.units[unitId]!;
  unit.status = "done";
  unit.outputRefs = receipt.refs;
  unit.receiptIds = unit.requiredReceiptIds ?? [receipt.id];
  delete unit.lastError;
  delete unit.regenerateApproved;
  if (job.target?.kind === "long") job.target.baseRevision++;
  if (job.target?.kind === "material-group")
    for (const ref of receipt.refs)
      job.target.baseRevisions[ref.projectId] = ref.revision;
}

/**
 * Finishes the registry merge without a model when the saved parts leave
 * nothing to decide: a single part, or parts without candidate clusters.
 */
export async function settleDecompositionRegistryMerge(
  service: DecompositionService,
  job: LongBookDecompositionJob
): Promise<boolean> {
  const merge = job.units["registry:merge"];
  if (
    job.phase !== "registry" ||
    !merge ||
    ["done", "skipped", "conflict"].includes(merge.status) ||
    merge.dependencies.some((id) => job.units[id]?.status !== "done")
  )
    return false;
  const cards = await readDecompositionCards(job, service.reader);
  const input = await registryMergeInput(
    job,
    (id) => service.reader.record(job, id),
    cards
  );
  if (input.candidates.length) return false;
  validateDecompositionRegistryCoverage(
    normalizeDecompositionRegistry(input.registry, 1),
    cards
  );
  const receipt = await service.write(job, "registry:merge", {
    kind: "registry",
    registry: input.registry
  });
  markDecompositionUnitDone(job, "registry:merge", receipt);
  await service.state.save(job);
  return true;
}
