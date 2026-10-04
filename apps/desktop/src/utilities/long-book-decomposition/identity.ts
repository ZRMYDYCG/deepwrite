import { createHash } from "node:crypto";
export function decompositionResourceId(
  prefix: string,
  jobId: string,
  key: string
): string {
  return `${prefix === "analysis" || prefix === "ldreceipt" ? `file_${prefix}` : prefix}_${createHash("sha256").update(`${jobId}:${key}`).digest("hex").slice(0, 24)}`;
}
export const decompositionReceiptId = (
  jobId: string,
  outputVersion: number,
  unitId: string,
  inputRevision: string
) =>
  decompositionResourceId(
    "ldreceipt",
    jobId,
    `${outputVersion}:${unitId}:${inputRevision}`
  );
