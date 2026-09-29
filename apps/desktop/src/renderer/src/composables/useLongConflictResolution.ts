import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import { replaceLongBookSummary } from "../types/longWorkspace";
import type { LongBookLifecycleCoordinatorOptions } from "./longBookLifecycleTypes";

const t = createScopedTranslator("workspace.longConflictResolution");

interface Options extends Pick<
  LongBookLifecycleCoordinatorOptions,
  "api" | "state" | "session" | "workflow" | "catalog" | "notifications"
> {
  isDisposed(): boolean;
  runTracked(task: () => Promise<void>): Promise<void>;
}

export function useLongConflictResolution(options: Options) {
  const { state, notifications, session, workflow, catalog } = options;
  return async (bookId: string): Promise<void> => {
    if (
      options.isDisposed() ||
      state.bookActionPending.value ||
      state.mutationPending.value
    )
      return;
    const api = options.api();
    if (!api) return;
    state.bookActionPending.value = true;
    state.mutationPending.value = true;
    await options.runTracked(async () => {
      let resolved = false;
      try {
        await workflow.stopBookAgentRuns(bookId);
        if (options.isDisposed()) return;
        session.invalidateWorkspaceRefresh(bookId);
        // Saving first would hit the same blocked recovery and make this
        // action unreachable. Keep editor drafts while repairing disk state.
        const result = await api.resolveConflicts({ bookId });
        resolved = true;
        if (options.isDisposed()) return;
        // Invalidate any list response captured while recovery was blocked
        // before publishing the repaired summary or awaiting a workspace read.
        await catalog.loadBookList({ force: true });
        if (options.isDisposed()) return;
        state.longBooks.value = replaceLongBookSummary(
          state.longBooks.value,
          result.summary
        );
        if (state.activeBookId.value === bookId) {
          if (!(await session.refreshActiveWorkspace(bookId))) {
            notifications.warning(
              t("fileConflictsWereResolvedButTheWorkspaceRefreshFailed")
            );
            return;
          }
        }
        await catalog.refreshWorkspaceDirectory();
        if (options.isDisposed()) return;
        notifications.success(
          result.resolvedPaths.length
            ? t("resolvedFileConflictsDiskChangesAndRecoveryBackupsWere", {
                length: result.resolvedPaths.length
              })
            : t("diskStateSyncedYouCanContinue")
        );
      } catch (error: unknown) {
        if (!options.isDisposed()) {
          const detail = formatError(error, t("pleaseTryAgainShortly"));
          notifications.error(
            t("message", {
              value: resolved
                ? t("fileConflictsResolvedButRefreshFailed")
                : t("failedToResolveConflicts"),
              detail: detail
            })
          );
        }
      } finally {
        state.bookActionPending.value = false;
        state.mutationPending.value = false;
      }
    });
  };
}
