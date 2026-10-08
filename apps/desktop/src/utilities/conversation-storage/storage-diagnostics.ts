import {
  appendFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs";
import { dirname, join } from "node:path";
import type { StorageFailure } from "./storage-failure";

/** Core records only codes and stages, never history, credentials or error text. */
export function recordStorageFailure(
  databasePath: string,
  failure: StorageFailure,
  method?: string
): void {
  const directory = join(dirname(dirname(databasePath)), "diagnostics");
  const path = join(directory, "conversation-storage.log");
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      if (statSync(path).size > 256 * 1024) {
        rmSync(`${path}.previous`, { force: true });
        renameSync(path, `${path}.previous`);
      }
    } catch {
      // A new profile has no diagnostic log yet.
    }
    const { message: _message, ...codes } = failure;
    appendFileSync(
      path,
      `${JSON.stringify({
        time: new Date().toISOString(),
        ...codes,
        ...(method && /^[a-zA-Z]{1,48}$/u.test(method) ? { method } : {})
      })}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
  } catch {
    // A read-only or disconnected profile must still return its original error.
  }
}
