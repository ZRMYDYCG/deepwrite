import { t } from "../i18n";
import type { AgentEditProposal } from "../types/conversation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseStoredDiscardSnapshot(
  value: unknown
): AgentEditProposal["discardSnapshot"] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  if (
    (value.beforeText !== undefined && typeof value.beforeText !== "string") ||
    (value.beforeTitle !== undefined &&
      typeof value.beforeTitle !== "string") ||
    (value.beforeDescription !== undefined &&
      typeof value.beforeDescription !== "string") ||
    (value.appliedProjectRevision !== undefined &&
      (!Number.isInteger(value.appliedProjectRevision) ||
        Number(value.appliedProjectRevision) < 0))
  ) {
    return undefined;
  }
  return {
    ...(typeof value.beforeText === "string"
      ? { beforeText: value.beforeText }
      : {}),
    ...(typeof value.beforeTitle === "string"
      ? { beforeTitle: value.beforeTitle }
      : {}),
    ...(typeof value.beforeDescription === "string"
      ? { beforeDescription: value.beforeDescription }
      : {}),
    ...(typeof value.appliedProjectRevision === "number"
      ? { appliedProjectRevision: value.appliedProjectRevision }
      : {})
  };
}

export function parseStoredDiscardState(
  value: unknown
): AgentEditProposal["discardState"] | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !["discarding", "discarded", "conflict", "error"].includes(
      String(value.status)
    ) ||
    typeof value.message !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    return undefined;
  }
  return {
    status: value.status === "discarding" ? "error" : value.status,
    message:
      value.status === "discarding"
        ? t(
            "workspace.acceptedEditDiscardPersistence.thePreviousDiscardWasNotConfirmedTheCurrentVersion"
          )
        : value.message,
    updatedAt: value.updatedAt
  } as NonNullable<AgentEditProposal["discardState"]>;
}
