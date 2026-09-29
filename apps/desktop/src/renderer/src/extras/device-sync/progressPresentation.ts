import { syncProgressText } from "./displayText";
import { createScopedTranslator } from "../../i18n";
import type { SyncStatus } from "@deepwrite/contracts/renderer";
import { syncPresentation } from "./presentation";

const t = createScopedTranslator("extras.deviceSync");

export function syncProgressPresentation(status: SyncStatus, pending: boolean) {
  const view = syncPresentation(status);
  const { phase, titleText, total, completed, filesTotal, filesCompleted } =
    status.progress;
  const first = status.issues.some((issue) => issue.reason === "first-sync");
  const title = syncProgressText(status.progress);
  const currentItem =
    pending && typeof titleText?.params?.title === "string"
      ? titleText.params.title
      : undefined;
  const transferring = phase === "transferring" || phase === "applying";
  const determinate =
    total > 0 &&
    (pending ? transferring : ["complete", "partial"].includes(phase));
  const done = Math.min(total, Math.max(0, completed));
  let badge: string;
  let stage: string;
  if (pending) {
    if (phase === "saving")
      [badge, stage] = [t("preparingBadge"), t("preparingLocalContents")];
    else if (phase === "checking")
      [badge, stage] = [t("checkingBadge"), t("checkingRemote")];
    else if (phase === "applying")
      [badge, stage] = [t("writingBadge"), t("writingLocalContents")];
    else if (phase === "transferring" && titleText?.code === "uploading")
      [badge, stage] = [t("uploadingBadge"), t("uploadingLocal")];
    else if (
      phase === "transferring" &&
      (titleText?.code === "downloading" ||
        titleText?.code === "downloadingSource")
    )
      [badge, stage] = [t("downloadingBadge"), t("downloadingRemote")];
    else if (phase === "transferring")
      [badge, stage] = [t("readingBadge"), t("readingChanges")];
    else [badge, stage] = [t("processingBadge"), t("processingSync")];
  } else if (first)
    [badge, stage] = [t("confirmationPending"), t("confirmFirstContents")];
  else if (phase === "failed")
    [badge, stage] = [t("incomplete"), t("operationIncomplete")];
  else if (phase === "cancelled")
    [badge, stage] = [t("cancelled"), t("operationCancelled")];
  else if (phase === "partial")
    [badge, stage] = [t("actionPending"), t("operationEnded")];
  else if (phase === "complete")
    [badge, stage] = [t("completed"), t("operationComplete")];
  else if (!status.firstSyncConfirmed)
    [badge, stage] = [t("initializationPending"), t("previewFirstRequired")];
  else if (
    view.uploads.length ||
    view.downloads.length ||
    view.adoptionKeys.length
  )
    [badge, stage] = [t("pendingSync"), t("waitingManualSync")];
  else if (!status.lastCheckedAt)
    [badge, stage] = [t("checkPending"), t("waitingRemoteCheck")];
  else [badge, stage] = [t("aligned"), t("matchesCheckedRemote")];

  return {
    badge,
    stage,
    determinate,
    completed: done,
    total,
    percent: determinate ? (done / total) * 100 : 0,
    count: determinate
      ? t("itemProgress", { completed: done, total: total })
      : pending
        ? t("pleaseWait")
        : "—",
    detail: currentItem
      ? t("processingItem", { title: currentItem })
      : title || view.title,
    secondary: pending
      ? transferring && filesTotal
        ? t("workFileProgress", {
            completed: Math.min(filesTotal, Math.max(0, filesCompleted ?? 0)),
            total: filesTotal
          })
        : phase === "checking"
          ? t("uploadedRecordsOnly")
          : t("resultsAfterCompletion")
      : title
        ? view.title
        : t("chooseSyncDirection")
  };
}
