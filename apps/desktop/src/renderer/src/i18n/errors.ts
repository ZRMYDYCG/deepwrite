import { ErrorPayloadSchema } from "@deepwrite/contracts/renderer";
import type { ErrorPayload } from "@deepwrite/contracts";
import type { TranslationKey } from "./messages";
import { t } from "./index";

const errorKeys: Readonly<Record<string, TranslationKey>> = {
  "catalog.conflict": "foundation.catalogConflict",
  "long.operation.impact_mismatch": "foundation.impactChanged",
  "long.operation.not_found": "foundation.targetNotFound",
  "long.operation.already_exists": "foundation.targetExists",
  "long.operation.invalid_reference": "foundation.invalidReference",
  "long.operation.invalid_order": "foundation.invalidOrder",
  "long.operation.invalid_document_write": "foundation.invalidDocumentWrite",
  "long.operation.invalid_result": "foundation.invalidOperationResult",
  "long.ledger.audit_failed": "foundation.ledgerAuditFailed"
};

/** Diagnostics stay on the rejected payload; presentation never parses translated prose. */
export function getErrorPayload(error: unknown): ErrorPayload | undefined {
  const parsed = ErrorPayloadSchema.safeParse(error);
  return parsed.success ? parsed.data : undefined;
}

export function getErrorCode(error: unknown): string | undefined {
  return getErrorPayload(error)?.code;
}

export function formatError(error: unknown, fallback: string): string {
  const payload = getErrorPayload(error);
  if (payload) {
    const key = errorKeys[payload.code];
    return key ? t(key) : error instanceof Error ? error.message : fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
