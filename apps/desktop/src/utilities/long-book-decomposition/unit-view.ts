import type {
  DecompositionRecord,
  DecompositionUnitView,
  LongBookDecompositionJob
} from "@deepwrite/contracts";
import type { DecompositionRecordsReader } from "./records-reader";

/** What the progress dialog shows; a reading chunk shows its chapters. */
export async function readDecompositionUnitView(
  job: LongBookDecompositionJob,
  unitId: string,
  reader: DecompositionRecordsReader
): Promise<DecompositionUnitView> {
  const unit = job.units[unitId];
  if (!unit) throw new Error("单元不存在。");
  const ids = unitId.startsWith("chunk:") ? unit.dependencies : [unitId];
  const records: DecompositionRecord[] = [];
  await reader.snapshot(async () => {
    for (const id of ids)
      if (job.units[id]?.status === "done")
        records.push(await reader.record(job, id));
  });
  return { unitId, records, refs: unit.outputRefs };
}
