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

const MAX_ERROR_DETAIL_LENGTH = 240;

/**
 * Remote diagnostics (provider responses, network failures) cannot be
 * translated by code, so `formatError` falls back to the caller's headline.
 * Callers whose failure reason is the useful part append this detail instead.
 */
export function getErrorDetail(error: unknown): string | undefined {
  const raw =
    getErrorPayload(error)?.message ??
    (error instanceof Error ? error.message : "");
  const detail = raw.replace(/\s+/gu, " ").trim();
  if (!detail) return undefined;
  return detail.length > MAX_ERROR_DETAIL_LENGTH
    ? `${detail.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
    : detail;
}

export function formatError(error: unknown, fallback: string): string {
  const payload = getErrorPayload(error);
  if (payload) {
    const key = errorKeys[payload.code];
    return key ? t(key) : error instanceof Error ? error.message : fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
