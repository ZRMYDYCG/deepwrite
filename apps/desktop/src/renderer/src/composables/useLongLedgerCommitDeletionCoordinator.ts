import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import {
  longLedgerCommitChapterIds,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import type { Ref } from "vue";
import type { LongLedgerCommitDeleteTarget } from "../stores/longWorkspaceStore";
import type { LongWorkspaceRendererApi } from "../types/longWorkspace";
import type { ResourceTreeNode } from "../types/workspace";

const t = createScopedTranslator(
  "workspace.longLedgerCommitDeletionCoordinator"
);

interface Notifications {
  error(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

export function useLongLedgerCommitDeletionCoordinator(options: {
  api(): LongWorkspaceRendererApi | undefined;
  activeBookId: Readonly<Ref<string | null>>;
  workspaceIndex: Readonly<Ref<LongWorkspaceIndexSnapshot | null>>;
  target: Ref<LongLedgerCommitDeleteTarget | null>;
  pending: Ref<boolean>;
  saveActiveEditorChanges(): Promise<boolean>;
  refreshActiveWorkspace(bookId: string): Promise<boolean>;
  notifications: Notifications;
}) {
  let operationId = 0;

  function request(node: ResourceTreeNode): void {
    const metadata = node.longLedgerCommit;
    const bookId = node.longBookId;
    const index = options.workspaceIndex.value;
    if (
      !metadata ||
      !bookId ||
      options.activeBookId.value !== bookId ||
      !index
    ) {
      options.notifications.warning(
        t("thisCommitRecordIsUnavailableRefreshAndTryAgain")
      );
      return;
    }
    const latest = index.ledger.commits.at(-1);
    if (!metadata.deletable || latest?.id !== metadata.id) {
      options.notifications.warning(t("deleteTheLatestCommitRecordFirst"));
      return;
    }
    options.target.value = {
      bookId,
      commitId: metadata.id,
      title: node.label,
      chapterCardIds: longLedgerCommitChapterIds(latest)
    };
  }

  function close(): void {
    if (!options.pending.value) options.target.value = null;
  }

  async function confirm(): Promise<void> {
    const target = options.target.value;
    const api = options.api();
    if (!target || !api || options.pending.value) return;

    options.pending.value = true;
    const currentOperationId = ++operationId;
    try {
      if (!(await options.saveActiveEditorChanges())) return;
      if (
        currentOperationId !== operationId ||
        options.target.value !== target ||
        options.activeBookId.value !== target.bookId
      ) {
        return;
      }
      if (!(await options.refreshActiveWorkspace(target.bookId))) {
        options.notifications.error(
          t("theLatestContinuityLedgerCouldNotBeReadNothing")
        );
        return;
      }
      const latest = options.workspaceIndex.value?.ledger.commits.at(-1);
      if (latest?.id !== target.commitId) {
        options.target.value = null;
        options.notifications.warning(
          t("theCommitRecordOrderChangedSelectTheLatestRecord")
        );
        return;
      }

      const result = await api.deleteLedgerCommit({
        bookId: target.bookId,
        commitId: target.commitId
      });
      if (
        result.bookId !== target.bookId ||
        result.deletedCommitId !== target.commitId
      ) {
        throw new Error(
          t("deletingTheCommitRecordReturnedAnInconsistentResult")
        );
      }
      options.target.value = null;
      const refreshed = await options.refreshActiveWorkspace(target.bookId);
      if (!refreshed) {
        options.notifications.warning(
          t("commitRecordDeletedButTheLatestStateCouldNot")
        );
        return;
      }
      options.notifications.success(
        result.chapterCardIds.length === 1
          ? t("commitRecordDeletedTheChapterIsPendingCommitAgain")
          : t("commitRecordDeleted") +
              result.chapterCardIds.length +
              t("chaptersArePendingCommitAgain")
      );
    } catch (error: unknown) {
      options.notifications.error(
        formatError(error, t("failedToDeleteCommitRecord"))
      );
    } finally {
      if (currentOperationId === operationId) options.pending.value = false;
    }
  }

  return { request, close, confirm };
}
