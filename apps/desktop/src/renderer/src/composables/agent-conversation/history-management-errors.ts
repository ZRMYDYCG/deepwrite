import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";

const t = createScopedTranslator("workspace.historyManagementErrors");
export class HistoryDeletionNotCommittedError extends Error {
  constructor(error: unknown) {
    super(formatError(error, t("couldNotDeleteTheConversationTryAgain")));
    this.name = "HistoryDeletionNotCommittedError";
  }
}

export class HistoryPersistenceDeferredError extends Error {
  constructor(readonly sessionIds: readonly string[]) {
    super(t("conversationDeletionHasNotBeenConfirmedRetryDeletingIt"));
    this.name = "HistoryPersistenceDeferredError";
  }
}
