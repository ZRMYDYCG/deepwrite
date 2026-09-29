import { syncIssueMessage } from "../../../localization/sync-display-text";
import {
  hasRemoteSyncChange,
  sameSyncContent,
  type SyncDirection,
  type SyncIssue,
  type SyncItem,
  type SyncMetadata
} from "@deepwrite/contracts";
import type { SyncCandidate } from "./plan-item";

export function syncItemDirection(
  direction: SyncDirection,
  local: SyncItem | null,
  baseline: SyncMetadata["baselines"][string] | undefined,
  candidates: Pick<SyncCandidate, "revision">[]
) {
  const upload = !sameSyncContent(baseline?.item ?? null, local);
  const download = hasRemoteSyncChange(
    baseline,
    candidates.map(({ revision }) => revision)
  );
  return {
    upload,
    download,
    skip:
      (direction === "upload" && !upload && download) ||
      (direction === "download" && upload && !download)
  };
}

export function directionConflict(
  key: string,
  local: SyncItem | null,
  candidates: SyncCandidate[]
): SyncIssue {
  return {
    key,
    title: local?.title ?? candidates[0]?.revision.title ?? key,
    token: "",
    reason: "conflict",
    ...syncIssueMessage("directionConflict"),
    paths: [],
    local,
    versions: []
  };
}
