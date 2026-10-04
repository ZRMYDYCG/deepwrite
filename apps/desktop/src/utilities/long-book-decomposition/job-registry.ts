import {
  normalizeDecompositionRegistry,
  type DecompositionSaveRegistryInput
} from "@deepwrite/contracts";
import type { DecompositionService } from "./service";
import { readDecompositionRegistry, readDecompositionCards } from "./query";
import {
  validateDecompositionRegistryCoverage,
  planDecompositionIntegration
} from "./workflow";
import { assertDecompositionMaterialCapacity } from "./capacity";

export async function saveDecompositionRegistry(
  service: DecompositionService,
  input: DecompositionSaveRegistryInput
) {
  const job = await service.state.load(input.jobId);
  if (job.phase !== "registry_review" || job.status === "running")
    throw new Error("当前阶段不能编辑名册。");
  const current = await readDecompositionRegistry(job, service.reader);
  if (current.version !== input.baseRevision)
    throw new Error("名册已在其他位置修改，请刷新后保存。");
  const registry = normalizeDecompositionRegistry(
    input.registry,
    current.version + 1,
    true
  );
  validateDecompositionRegistryCoverage(
    registry,
    await readDecompositionCards(job, service.reader)
  );
  job.units["registry:merge"]!.inputRevision =
    job.units["registry:merge"]!.inputRevision.split(":registry-edit:")[0]! +
    `:registry-edit:${current.version + 1}`;
  const receipt = await service.write(job, "registry:merge", {
    kind: "registry",
    registry
  });
  job.units["registry:merge"]!.outputRefs = receipt.refs;
  job.units["registry:merge"]!.receiptIds = job.units["registry:merge"]!
    .requiredReceiptIds ?? [receipt.id];
  if (job.target?.kind === "long") job.target.baseRevision++;
  if (input.confirm) {
    await assertDecompositionMaterialCapacity(job, service.catalog, registry);
    planDecompositionIntegration(
      job,
      registry,
      await readDecompositionCards(job, service.reader)
    );
    await assertDecompositionMaterialCapacity(job, service.catalog, registry);
  }
  await service.state.save(job);
  return job;
}
