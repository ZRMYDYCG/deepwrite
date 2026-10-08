export type StoragePhase =
  | "worker-start"
  | "database-open"
  | "legacy-migration"
  | "runtime-recovery"
  | "operation";

export interface StorageFailure {
  code: string;
  message: string;
  phase: StoragePhase;
  nativeCode?: string;
  sqliteCode?: number;
}

const phases: ReadonlySet<string> = new Set<StoragePhase>([
  "worker-start",
  "database-open",
  "legacy-migration",
  "runtime-recovery",
  "operation"
]);

/** Preserve machine-readable causes before Worker error cloning drops them. */
export function describeStorageFailure(
  error: unknown,
  phase: StoragePhase
): StorageFailure {
  const value = (error && typeof error === "object" ? error : {}) as Record<
    string,
    unknown
  >;
  if (typeof value.phase === "string" && phases.has(value.phase))
    phase = value.phase as StoragePhase;
  const rawCode = value.nativeCode ?? value.code;
  const nativeCode =
    typeof rawCode === "string" && /^[A-Z][A-Z_0-9]{0,63}$/u.test(rawCode)
      ? rawCode
      : undefined;
  const rawSqliteCode = value.sqliteCode ?? value.errcode;
  const sqliteCode =
    typeof rawSqliteCode === "number" &&
    Number.isSafeInteger(rawSqliteCode) &&
    rawSqliteCode >= 0 &&
    rawSqliteCode <= 0x7fffffff
      ? rawSqliteCode
      : undefined;
  let code =
    typeof value.code === "string" && /^[a-z][a-z_]{0,63}$/u.test(value.code)
      ? value.code
      : phase === "legacy-migration"
        ? "migration_failed"
        : phase === "worker-start"
          ? "worker_unavailable"
          : "storage_failed";
  // SQLite extended result codes retain their primary code in the low byte.
  // https://www.sqlite.org/rescode.html
  const primary = sqliteCode === undefined ? undefined : sqliteCode & 0xff;
  if (
    [3, 8, 23].includes(primary!) ||
    ["EACCES", "EPERM", "EROFS"].includes(nativeCode!)
  )
    code = "permission_denied";
  else if (primary === 13 || ["ENOSPC", "EDQUOT"].includes(nativeCode!))
    code = "disk_full";
  else if (primary === 5 || primary === 6) code = "database_locked";
  else if (primary === 11 || primary === 26) code = "database_corrupt";
  else if (primary === 14 || ["ENOENT", "ENOTDIR"].includes(nativeCode!))
    code = "location_unavailable";
  else if (primary === 10) code = "disk_io_failed";
  return {
    code,
    message:
      error instanceof Error ? error.message : "Conversation storage failed.",
    phase,
    ...(nativeCode ? { nativeCode } : {}),
    ...(sqliteCode !== undefined ? { sqliteCode } : {})
  };
}

export function storageFailureError(failure: StorageFailure): Error {
  return Object.assign(new Error(failure.message), failure);
}
