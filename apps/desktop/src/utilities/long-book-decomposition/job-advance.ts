import type { LongBookDecompositionJob } from "@deepwrite/contracts";
import { readDecompositionCards, readDecompositionRegistry } from "./query";
import { assertDecompositionMaterialCapacity } from "./capacity";
import {
  planDecompositionRegistry,
  planDecompositionIntegration,
  planDecompositionReview
} from "./workflow";
import { finalizeDecomposition } from "./completion-service";
import type { DecompositionService } from "./service";
import { decompositionErrorMessage } from "./error-message";

export async function advanceDecompositionJob(
  service: DecompositionService,
  job: LongBookDecompositionJob
) {
  if (job.phase === "done") return job;
  if (job.status === "running") throw new Error("请等待当前工作包结束。");
  const remaining = Object.values(job.units).filter(
    (unit) =>
      unit.phase === job.phase && !["done", "skipped"].includes(unit.status)
  );
  if (remaining.length) return job;
  if (
    ["read", "registry"].includes(job.phase) &&
    job.units["registry:merge"]?.status === "done"
  )
    await assertDecompositionMaterialCapacity(
      job,
      service.catalog,
      await readDecompositionRegistry(job, service.reader)
    );
  if (job.phase === "read") {
    if (job.units["registry:merge"]?.status === "done") {
      job.phase = job.autoContinue ? "integrate" : "registry_review";
      if (job.autoContinue)
        planDecompositionIntegration(
          job,
          await readDecompositionRegistry(job, service.reader),
          await readDecompositionCards(job, service.reader)
        );
    } else
      planDecompositionRegistry(
        job,
        await readDecompositionCards(job, service.reader)
      );
  } else if (job.phase === "registry") {
    job.phase = "registry_review";
    if (job.autoContinue)
      planDecompositionIntegration(
        job,
        await readDecompositionRegistry(job, service.reader),
        await readDecompositionCards(job, service.reader)
      );
  } else if (job.phase === "integrate") planDecompositionReview(job);
  else if (job.phase === "review") job.phase = "finalize";
  if (job.phase === "integrate")
    await assertDecompositionMaterialCapacity(
      job,
      service.catalog,
      await readDecompositionRegistry(job, service.reader)
    );
  if (job.phase === "finalize") {
    try {
      await finalizeDecomposition(
        job,
        service.state,
        service.longs,
        service.catalog,
        service.reader
      );
    } catch (error) {
      job.status = "failed";
      job.lastError = decompositionErrorMessage(error, "完成校验失败。");
      await service.state.save(job);
      throw error;
    }
  } else await service.state.save(job);
  return job;
}
