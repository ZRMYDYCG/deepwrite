import { createScopedTranslator } from "../../i18n";
import { cloneMessage } from "./clone";
import type { AgentConversationContext } from "./context";
import { parsePersistenceRecord } from "./persistence-snapshot";
import type {
  AgentConversationHistorySnapshot,
  AgentConversationPersistenceRecord
} from "./types";

const t = createScopedTranslator("workspace.historyLoading");

type HistoryLoadingContext = Pick<
  AgentConversationContext,
  | "options"
  | "historyOperationPending"
  | "remoteHistoryItems"
  | "storedConversations"
  | "isBusy"
  | "sessionId"
  | "messages"
  | "draft"
  | "epoch"
  | "persistenceNotificationsEnabled"
  | "persistenceMutationRevision"
  | "applyingPersistenceSnapshot"
  | "messageMutations"
  | "approvalMode"
  | "temperature"
  | "currentCreatedAt"
  | "currentUpdatedAt"
  | "conversationClock"
  | "resetTransientConversationState"
  | "selectConversation"
  | "persistenceJournal"
  | "storedEnvelope"
>;

export function validateHistoryRecord(
  record: AgentConversationPersistenceRecord,
  sessionId: string
) {
  const parsed = parsePersistenceRecord(record);
  if (!parsed || parsed.sessionId !== sessionId)
    throw new Error(
      t("theConversationHistoryIsIncompleteCannotSwitchConversationsTry")
    );
  return parsed;
}

/** Applies a fully loaded record while callers suppress journal mutation recording. */
export function applyHistoryRecord(
  ctx: HistoryLoadingContext,
  record: AgentConversationPersistenceRecord
) {
  ctx.resetTransientConversationState();
  ctx.sessionId.value = record.sessionId;
  ctx.messageMutations.replaceLoaded(record.messages.map(cloneMessage));
  ctx.draft.value = record.draft;
  ctx.approvalMode.value = record.approvalMode;
  ctx.temperature.value = record.temperature;
  ctx.currentCreatedAt.value = record.createdAt;
  ctx.currentUpdatedAt.value = record.updatedAt;
  ctx.conversationClock = Math.max(
    ctx.conversationClock,
    Date.parse(record.updatedAt)
  );
}

export function createHistoryLoader(ctx: HistoryLoadingContext) {
  async function loadRecord(sessionId: string) {
    const existing = ctx.storedConversations.value.find(
      (record) => record.sessionId === sessionId
    );
    if (existing) return existing;
    if (!ctx.options.loadHistoryRecord)
      throw new Error(
        t("theCurrentStorageDoesNotSupportLoadingThisConversation")
      );
    return validateHistoryRecord(
      await ctx.options.loadHistoryRecord(sessionId),
      sessionId
    );
  }
  function installRecord(record: AgentConversationPersistenceRecord) {
    ctx.storedConversations.value = [
      ...ctx.storedConversations.value.filter(
        (value) => value.sessionId !== record.sessionId
      ),
      record
    ];
    ctx.persistenceJournal.initializeSessionBaseline(record.sessionId);
  }
  async function openConversation(sessionId: string): Promise<boolean> {
    if (sessionId === ctx.sessionId.value) return true;
    if (ctx.isBusy.value || !ctx.persistenceNotificationsEnabled) return false;
    // Invalidate a prompt-context read that began before the user chose another session.
    const epoch = ++ctx.epoch;
    ctx.historyOperationPending.value = true;
    try {
      await ctx.options.flushPersistence?.({ allowDeferred: true });
      const record = await loadRecord(sessionId);
      // A draft can still be edited while the read is pending. Save it before departure.
      await ctx.options.flushPersistence?.({ allowDeferred: true });
      if (!ctx.persistenceNotificationsEnabled || ctx.epoch !== epoch)
        return false;
      if (
        !ctx.storedConversations.value.some(
          (value) => value.sessionId === sessionId
        )
      )
        installRecord(record);
      ctx.historyOperationPending.value = false;
      return ctx.selectConversation(sessionId);
    } finally {
      ctx.historyOperationPending.value = false;
    }
  }
  async function restorePersistenceHistory(
    snapshot: AgentConversationHistorySnapshot
  ): Promise<boolean> {
    const record = snapshot.active
      ? validateHistoryRecord(snapshot.active, snapshot.activeSessionId)
      : undefined;
    if (
      !record &&
      snapshot.items.some((item) => item.sessionId === snapshot.activeSessionId)
    )
      throw new Error(t("theActiveConversationHasNotFinishedLoading"));
    await Promise.resolve();
    if (!ctx.persistenceNotificationsEnabled) return false;
    ctx.remoteHistoryItems.value = snapshot.items.map((item) => ({ ...item }));
    if (
      ctx.persistenceMutationRevision !== 0 ||
      ctx.storedEnvelope ||
      ctx.options.initialMessages?.length ||
      ctx.messages.value.length ||
      ctx.draft.value ||
      ctx.storedConversations.value.length ||
      ctx.isBusy.value
    )
      return false;
    ctx.applyingPersistenceSnapshot = true;
    try {
      ctx.storedConversations.value = record ? [record] : [];
      if (record) applyHistoryRecord(ctx, record);
      else ctx.sessionId.value = snapshot.activeSessionId;
      ctx.persistenceJournal.initializeBaseline();
    } finally {
      ctx.applyingPersistenceSnapshot = false;
    }
    return true;
  }
  return {
    openConversation,
    restorePersistenceHistory,
    loadRecord,
    installRecord
  };
}
export type ConversationHistoryLoader = ReturnType<typeof createHistoryLoader>;
