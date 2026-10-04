import type {
  DecompositionReceipt,
  DecompositionSubmissionData,
  LongBookDecompositionJob
} from "@deepwrite/contracts";
import type { DecompositionRecordsReader } from "./records-reader";
import type { DecompositionJobStateStore } from "./job-state-store";

/** Copies confirmed records into the new destination without calling a model. */
export async function copyReusedDecompositionRecords(
  job: LongBookDecompositionJob,
  reader: DecompositionRecordsReader,
  state: DecompositionJobStateStore,
  write: (
    unitId: string,
    data: DecompositionSubmissionData
  ) => Promise<DecompositionReceipt>
) {
  if (!job.reusedFromJobId || !job.target) return;
  const projects =
    job.target.kind === "long"
      ? [job.target.bookId]
      : Object.values(job.target.libraryIds);
  for (const [id, unit] of Object.entries(job.units)) {
    if (
      unit.status !== "done" ||
      !(unit.phase === "read" || id.startsWith("registry:")) ||
      unit.outputRefs.every(({ projectId }) => projects.includes(projectId))
    )
      continue;
    const record = await reader.record(job, id);
    const receipt = await write(id, record.data);
    unit.outputRefs = receipt.refs;
    unit.receiptIds = unit.requiredReceiptIds ?? [receipt.id];
    if (job.target.kind === "long") job.target.baseRevision++;
    await state.save(job);
  }
}
