import type {
  SyncDisplayText,
  SyncIssue,
  SyncProgress
} from "@deepwrite/contracts/renderer";
import { t } from "../../i18n";

export function syncText(text: SyncDisplayText): string {
  return t(`extras.deviceSyncService.${text.code}`, text.params);
}

export function syncProgressText(progress: SyncProgress): string {
  return progress.titleText ? syncText(progress.titleText) : progress.title;
}

export function syncIssueTitle(issue: SyncIssue): string {
  return issue.reason === "first-sync"
    ? syncText({ code: "firstPreview" })
    : issue.title;
}

export function syncIssueText(issue: SyncIssue): string {
  return issue.messageText ? syncText(issue.messageText) : issue.message;
}
