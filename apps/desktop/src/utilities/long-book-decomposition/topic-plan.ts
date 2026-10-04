import type { DecompositionTopicPlanInput } from "@deepwrite/contracts";
import type { DecompositionJobStateStore } from "./job-state-store";
import { addDecompositionUnit } from "./workflow";
import type { FolderCatalogStore } from "../folder-catalog-store";
import { assertDecompositionMaterialCapacity } from "./capacity";

export async function planDecompositionTopic(
  state: DecompositionJobStateStore,
  input: DecompositionTopicPlanInput,
  catalog?: FolderCatalogStore
) {
  const job = await state.load(input.jobId);
  if (
    job.status !== "running" ||
    job.activeAttemptId !== input.attemptId ||
    job.outputVersion !== input.outputVersion ||
    !["integrate", "review"].includes(job.phase)
  )
    throw new Error("专题只能由当前整合或审校工作包登记。");
  if (input.dependencies.some((id) => job.units[id]?.status !== "done"))
    throw new Error("专题依赖必须已持久化完成。");
  const unitId = `topic:${input.attemptId}:${input.topicNumber}`;
  const existing = job.units[unitId];
  if (existing) {
    if (
      existing.topic?.domain !== input.domain ||
      existing.topic?.title !== input.title ||
      JSON.stringify(existing.dependencies) !==
        JSON.stringify(input.dependencies)
    )
      throw new Error("专题编号已用于另一任务。");
    return { unitId, unit: existing };
  }
  if (
    Object.keys(job.units).filter((id) => id.startsWith("topic:")).length >=
      20 ||
    Object.values(job.units).filter(
      (unit) => unit.attemptId === input.attemptId
    ).length >= 20
  )
    throw new Error("专题已达到每任务 20 个或每包 20 个单元的上限。");
  addDecompositionUnit(job, unitId, job.phase, input.dependencies);
  const unit = job.units[unitId]!;
  unit.topic = { domain: input.domain, title: input.title };
  unit.attemptId = input.attemptId;
  unit.status = "running";
  if (catalog) await assertDecompositionMaterialCapacity(job, catalog);
  await state.save(job);
  return { unitId, unit };
}
