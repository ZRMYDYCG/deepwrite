import type { SyncDisplayText } from "@deepwrite/contracts";
import chinese from "./device-sync/zh-CN";

/** The fallback preserves older clients and diagnostic logs; UI uses the descriptor. */
export function syncDisplayText(
  code: SyncDisplayText["code"],
  params?: SyncDisplayText["params"]
) {
  const text: SyncDisplayText = params ? { code, params } : { code };
  const fallback = chinese[code].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name] ?? "")
  );
  return { text, fallback };
}
export function syncProgressTitle(
  code: SyncDisplayText["code"],
  params?: SyncDisplayText["params"]
) {
  const { text, fallback } = syncDisplayText(code, params);
  return { title: fallback, titleText: text };
}
export function syncIssueMessage(
  code: SyncDisplayText["code"],
  params?: SyncDisplayText["params"]
) {
  const { text, fallback } = syncDisplayText(code, params);
  return { message: fallback, messageText: text };
}
