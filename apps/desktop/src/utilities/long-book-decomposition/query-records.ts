import {
  normalizeDecompositionRegistry,
  type LongBookDecompositionJob,
  type DecompositionReadingCard,
  type DecompositionRegistry
} from "@deepwrite/contracts";
import type { DecompositionRecordsReader } from "./records-reader";

export async function readDecompositionCards(
  job: LongBookDecompositionJob,
  reader: DecompositionRecordsReader
): Promise<DecompositionReadingCard[]> {
  return reader.snapshot(async () => {
    const cards: DecompositionReadingCard[] = [];
    for (const [unitId, unit] of Object.entries(job.units)) {
      if (!unitId.startsWith("reading:") || unit.status !== "done") continue;
      const record = await reader.record(job, unitId);
      if (record.data.kind === "reading") cards.push(record.data.card);
    }
    return cards;
  });
}
export async function readDecompositionRegistry(
  job: LongBookDecompositionJob,
  reader: DecompositionRecordsReader
): Promise<DecompositionRegistry> {
  const record = await reader.record(job, "registry:merge");
  if (record.data.kind !== "registry") throw new Error("正式名册格式无效。");
  // Each user save bumps the revision suffix; the merge itself is version 1.
  const edit = /:registry-edit:(\d+)/u.exec(
    job.units["registry:merge"]!.inputRevision
  );
  return normalizeDecompositionRegistry(
    record.data.registry,
    edit ? Number(edit[1]) : 1,
    job.phase !== "registry"
  );
}
