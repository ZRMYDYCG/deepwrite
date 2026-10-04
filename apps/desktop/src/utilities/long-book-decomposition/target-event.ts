import {
  createEnvelope,
  DecompositionReceiptSchema,
  DecompositionTargetUpdatedEventSchema,
  LongBookDecompositionJobSchema,
  type CommandEnvelope,
  type CommandResult
} from "@deepwrite/contracts";
export function decompositionTargetEvent(
  command: CommandEnvelope,
  result: CommandResult
) {
  if (result.status !== "accepted") return undefined;
  if (command.type === "longBookDecomposition.submitUnit") {
    const receipt = DecompositionReceiptSchema.parse(result.payload);
    // Task-local records change nothing in the creative workspace.
    if (!receipt.refs.length) return undefined;
    return DecompositionTargetUpdatedEventSchema.parse(
      createEnvelope(
        "decomposition.target_updated",
        {
          jobId: receipt.jobId,
          targetKind: receipt.refs.some(({ fileId }) => fileId)
            ? "long"
            : "material-group",
          projectIds: [
            ...new Set(receipt.refs.map(({ projectId }) => projectId))
          ],
          unitId: receipt.unitId
        },
        { id: `${command.id}-target`, context: command.context }
      )
    );
  }
  if (
    command.type !== "longBookDecomposition.coreCreate" &&
    !(
      command.type === "longBookDecomposition.coreAccess" &&
      ["control", "save-registry"].includes(command.payload.operation)
    )
  )
    return undefined;
  const job = LongBookDecompositionJobSchema.safeParse(result.payload);
  if (!job.success || !job.data.target) return undefined;
  const target = job.data.target;
  return DecompositionTargetUpdatedEventSchema.parse(
    createEnvelope(
      "decomposition.target_updated",
      {
        jobId: job.data.id,
        targetKind: target.kind,
        projectIds:
          target.kind === "long"
            ? [target.bookId]
            : Object.values(target.libraryIds)
      },
      { id: `${command.id}-target`, context: command.context }
    )
  );
}
