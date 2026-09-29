import type { LongWorkspaceRuntimeContext } from "@deepwrite/contracts";
import { LongWorkspaceRuntimeContextSchema } from "@deepwrite/contracts/renderer";

/** Long-form context validation is only needed when a user submits a turn. */
export function validateLongRuntimeContext(
  context: LongWorkspaceRuntimeContext
): LongWorkspaceRuntimeContext {
  return LongWorkspaceRuntimeContextSchema.parse(context);
}
